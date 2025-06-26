import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  sprintId: string;
  topic: string;
  goals: string;
  tags?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
      urlStart: supabaseUrl.substring(0, 20),
      keyStart: supabaseKey.substring(0, 20)
    });

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { sprintId, topic, goals, tags = [] }: RequestBody = await req.json()

    // Generate AI summary based on topic and goals
    const summaryPrompt = `Generate a comprehensive study summary for the following:

Topic: ${topic}
Goals: ${goals}

Create 3-5 key bullet points that capture the main concepts, learning objectives, and important details. Make each bullet point concise but informative. Focus on the core knowledge that should be retained.

Return only the bullet points as a JSON array of strings.`

    const summaryResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: 'You are a study assistant that creates comprehensive summaries. Return only valid JSON arrays of strings.'
          },
          {
            role: 'user',
            content: summaryPrompt
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      })
    })

    if (!summaryResponse.ok) {
      throw new Error(`OpenAI API error: ${summaryResponse.status}`)
    }

    const summaryData = await summaryResponse.json()
    const bullets = JSON.parse(summaryData.choices[0].message.content)

    // Generate embedding for the summary content
    const embeddingText = `${topic} ${goals} ${bullets.join(' ')}`
    
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
    const embedding = embeddingData.data[0].embedding

    // Extract/generate tags from topic
    const topicTags = [...tags]
    if (!topicTags.length) {
      // Generate tags from topic using simple keyword extraction
      const topicWords = topic.toLowerCase().split(/\s+/)
      topicTags.push(...topicWords.filter(word => word.length > 2))
    }

    // Save summary with embedding to database
    const { data: summary, error: summaryError } = await supabase
      .from('summaries')
      .insert({
        sprint_id: sprintId,
        bullets,
        tags: topicTags,
        embedding
      })
      .select()
      .single()

    if (summaryError) {
      throw summaryError
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        summary,
        message: 'Summary generated with RAG embedding'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error generating summary:', error)
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