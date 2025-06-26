import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  userId: string;
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

    const { userId }: RequestBody = await req.json()

    // Get user's study history and performance data
    const { data: suggestionData, error: dataError } = await supabase
      .rpc('get_next_topic_suggestion_data', {
        p_user_id: userId
      })

    if (dataError) {
      throw dataError
    }

    const userData = suggestionData?.[0] || {
      recent_topics: [],
      recent_tags: [],
      current_streak: 0,
      best_streak: 0,
      weak_areas: [],
      strong_areas: []
    }

    // Generate next topic suggestion
    const suggestionPrompt = `Based on this user's study history and performance, suggest their next study topic:

Recent Study Topics: ${userData.recent_topics?.join(', ') || 'None'}

Recent Study Tags/Areas: ${userData.recent_tags?.join(', ') || 'None'}

Current Study Streak: ${userData.current_streak} days
Best Streak: ${userData.best_streak} days

Weak Areas (need reinforcement): ${userData.weak_areas?.join(', ') || 'None identified'}

Strong Areas (mastered): ${userData.strong_areas?.join(', ') || 'None identified'}

Guidelines for suggestion:
1. If they have weak areas, prioritize reinforcing those concepts
2. If they're on a good streak (>3 days), suggest building on their momentum
3. If they've been studying similar topics, suggest either:
   - A deeper dive into the same area, OR
   - A complementary/related topic to broaden knowledge
4. If they're new (no history), suggest fundamental topics in their apparent area of interest
5. Consider their learning progression - don't suggest topics too advanced

Return ONLY a JSON object with this format:
{
  "topic": "Suggested topic name",
  "reason": "Brief explanation (1-2 sentences) of why this topic is recommended based on their study pattern",
  "difficulty": "beginner" | "intermediate" | "advanced",
  "estimated_duration": 25,
  "tags": ["tag1", "tag2"],
  "builds_on": ["previous_topic1", "previous_topic2"] or null
}`

    const suggestionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: 'You are an intelligent study advisor that analyzes learning patterns and suggests optimal next topics. Return only valid JSON.'
          },
          {
            role: 'user',
            content: suggestionPrompt
          }
        ],
        max_tokens: 400,
        temperature: 0.7
      })
    })

    if (!suggestionResponse.ok) {
      throw new Error(`OpenAI Suggestion API error: ${suggestionResponse.status}`)
    }

    const suggestionResponseData = await suggestionResponse.json()
    let suggestionContent = suggestionResponseData.choices[0].message.content
    
    // Clean the JSON response by removing markdown code blocks if present
    if (suggestionContent.includes('```json')) {
      suggestionContent = suggestionContent.replace(/```json\n?/g, '').replace(/\n?```/g, '')
    } else if (suggestionContent.includes('```')) {
      suggestionContent = suggestionContent.replace(/```\n?/g, '').replace(/\n?```/g, '')
    }
    
    const suggestion = JSON.parse(suggestionContent.trim())

    return new Response(
      JSON.stringify({ 
        success: true, 
        suggestion,
        userData: {
          recentTopics: userData.recent_topics,
          currentStreak: userData.current_streak,
          weakAreas: userData.weak_areas,
          strongAreas: userData.strong_areas
        },
        message: 'Next topic suggestion generated using RAG and user history'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error generating topic suggestion:', error)
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