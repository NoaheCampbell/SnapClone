import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  sprintId: string;
  topic: string;
  summaryBullets: string[];
  tags: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { sprintId, topic, summaryBullets, tags }: RequestBody = await req.json()

    // Generate embedding for current topic to find related content
    const embeddingText = `${topic} ${summaryBullets.join(' ')}`
    
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: embeddingText,
        dimensions: 1536
      })
    })

    if (!embeddingResponse.ok) {
      throw new Error(`OpenAI Embedding API error: ${embeddingResponse.status}`)
    }

    const embeddingData = await embeddingResponse.json()
    const queryEmbedding = embeddingData.data[0].embedding

    // Find related summaries using vector search
    const { data: relatedSummaries, error: vectorError } = await supabase
      .rpc('find_similar_summaries', {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: 8,
        filter_tags: tags.length > 0 ? tags : null,
        exclude_sprint_id: sprintId
      })

    if (vectorError) {
      console.error('Vector search error:', vectorError)
    }

    // Prepare context for concept map generation
    const relatedContent = (relatedSummaries || []).map(s => ({
      bullets: s.bullets,
      similarity: s.similarity,
      tags: s.tags
    })).slice(0, 5)

    // Generate Mermaid concept map
    const conceptMapPrompt = `Create a Mermaid concept map diagram for the following study topic and related content:

Main Topic: ${topic}

Key Concepts from Current Study:
${summaryBullets.map(bullet => `- ${bullet}`).join('\n')}

Related Content from Past Studies:
${relatedContent.map((content, i) => 
  `Study ${i + 1} (similarity: ${(content.similarity * 100).toFixed(1)}%):\n${content.bullets.map(b => `  - ${b}`).join('\n')}`
).join('\n\n')}

Create a Mermaid flowchart that:
1. Shows the main topic as the central node
2. Connects key concepts from the current study
3. Links to related concepts from past studies
4. Uses different node shapes to distinguish between:
   - Main topic (rounded rectangle)
   - Current concepts (rectangles) 
   - Related past concepts (circles)
   - Connections (arrows with labels)

Return ONLY the Mermaid diagram code starting with "flowchart TD" or "graph TD". Do not include markdown code blocks or explanations.

Example format:
flowchart TD
    A[Main Topic] --> B[Concept 1]
    A --> C[Concept 2]
    B --> D((Related Concept))
    C --> E((Another Related))
    D -.-> F[Connection]`

    const conceptMapResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at creating educational concept maps using Mermaid syntax. Return only the Mermaid diagram code.'
          },
          {
            role: 'user',
            content: conceptMapPrompt
          }
        ],
        max_tokens: 800,
        temperature: 0.3
      })
    })

    if (!conceptMapResponse.ok) {
      throw new Error(`OpenAI Concept Map API error: ${conceptMapResponse.status}`)
    }

    const conceptMapData = await conceptMapResponse.json()
    const mermaidCode = conceptMapData.choices[0].message.content.trim()

    // Update summary with concept map data
    const { error: updateError } = await supabase
      .from('summaries')
      .update({ concept_map_data: mermaidCode })
      .eq('sprint_id', sprintId)

    if (updateError) {
      console.error('Error updating concept map:', updateError)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        conceptMap: mermaidCode,
        relatedContent: relatedContent.length,
        message: 'Concept map generated using RAG'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error generating concept map:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
}) 