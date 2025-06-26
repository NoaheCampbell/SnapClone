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
  tags: string[];
  questionCount: number;
  userId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Environment check:', {
      hasRemoteUrl: !!Deno.env.get('REMOTE_SUPABASE_URL'),
      hasServiceKey: !!Deno.env.get('REMOTE_SUPABASE_SERVICE_ROLE_KEY'),
      hasOpenAI: !!Deno.env.get('OPENAI_API_KEY')
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { sprintId, topic, goals, tags, questionCount, userId }: RequestBody = await req.json()

    // Generate embedding for current topic to find similar past content
    const embeddingText = `${topic} ${goals}`
    
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

    // Find similar summaries using vector search
    const { data: similarSummaries, error: vectorError } = await supabase
      .rpc('find_similar_summaries', {
        query_embedding: queryEmbedding,
        match_threshold: 0.6,
        match_count: 10,
        filter_tags: tags.length > 0 ? tags : null,
        exclude_sprint_id: sprintId
      })

    if (vectorError) {
      console.error('Vector search error:', vectorError)
    }

    // Get user's recent study history with missed concepts
    const { data: userHistory, error: historyError } = await supabase
      .rpc('get_user_recent_summaries_with_missed_concepts', {
        p_user_id: userId,
        p_tags: tags.length > 0 ? tags : null,
        p_limit: 10
      })

    if (historyError) {
      console.error('History error:', historyError)
    }

    // Compile context for gap-aware quiz generation
    const similarContent = (similarSummaries || []).map(s => ({
      topic: s.sprint_topic || 'Unknown',
      bullets: s.bullets,
      similarity: s.similarity
    })).slice(0, 5)

    const missedConcepts = (userHistory || [])
      .flatMap(h => h.missed_concepts || [])
      .filter((concept, index, arr) => arr.indexOf(concept) === index) // unique
      .slice(0, 10)

    const weakAreas = (userHistory || [])
      .filter(h => h.quiz_score < 70)
      .map(h => h.sprint_topic)
      .filter((topic, index, arr) => arr.indexOf(topic) === index)
      .slice(0, 5)

    // Generate gap-aware quiz
    const quizPrompt = `Generate a ${questionCount}-question multiple choice quiz for this study session:

Current Topic: ${topic}
Goals: ${goals}

IMPORTANT: This quiz should be "gap-aware" - include questions that address knowledge gaps from the user's study history.

Previously Missed Concepts: ${missedConcepts.length > 0 ? missedConcepts.join(', ') : 'None identified'}

Weak Areas to Reinforce: ${weakAreas.length > 0 ? weakAreas.join(', ') : 'None identified'}

Related Content from Past Studies:
${similarContent.map(c => `- ${c.topic}: ${c.bullets.join('; ')}`).join('\n')}

Quiz Requirements:
1. ${Math.max(1, Math.floor(questionCount * 0.4))} questions should focus on the current topic
2. ${Math.max(1, Math.floor(questionCount * 0.4))} questions should reinforce previously missed concepts
3. ${Math.max(1, questionCount - Math.floor(questionCount * 0.8))} questions should connect current topic to past learning

Each question should have 4 options with one correct answer.

Return ONLY a valid JSON object in this format:
{
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 0,
      "focus_area": "current_topic" | "missed_concept" | "connection"
    }
  ]
}`

    const quizResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: 'You are an expert quiz generator that creates gap-aware assessments. Return only valid JSON.'
          },
          {
            role: 'user',
            content: quizPrompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.3
      })
    })

    if (!quizResponse.ok) {
      throw new Error(`OpenAI Quiz API error: ${quizResponse.status}`)
    }

    const quizData = await quizResponse.json()
    let rawContent = quizData.choices[0].message.content
    
    // Remove markdown code blocks if present
    if (rawContent.includes('```json')) {
      rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    }
    if (rawContent.includes('```')) {
      rawContent = rawContent.replace(/```\n?/g, '')
    }
    
    const quizContent = JSON.parse(rawContent.trim())

    return new Response(
      JSON.stringify({ 
        success: true, 
        quiz: quizContent,
        context: {
          similarSummaries: similarContent,
          missedConcepts,
          weakAreas
        },
        message: 'Gap-aware quiz generated using RAG'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error generating gap-aware quiz:', error)
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