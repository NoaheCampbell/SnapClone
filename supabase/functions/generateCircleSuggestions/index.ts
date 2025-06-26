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

    // Get user's study history and current circles
    const { data: userSprints, error: sprintsError } = await supabase
      .from('sprints')
      .select(`
        topic,
        tags,
        summaries (
          bullets,
          tags,
          embedding
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (sprintsError) {
      throw sprintsError
    }

    // Get user's current circles
    const { data: userCircles, error: circlesError } = await supabase
      .from('circle_members')
      .select('circle_id')
      .eq('user_id', userId)

    if (circlesError) {
      throw circlesError
    }

    const userCircleIds = userCircles.map(c => c.circle_id)

    // Extract topics and tags from user's study history
    const userTopics = userSprints.map(s => s.topic).filter(Boolean)
    const userTags = userSprints.flatMap(s => s.tags || [])
    const summaryTags = userSprints.flatMap(s => s.summaries?.tags || [])
    const allUserTags = [...userTags, ...summaryTags].filter(Boolean)

    // Create a representative embedding for the user's interests
    const userInterestsText = `${userTopics.join(' ')} ${allUserTags.join(' ')}`
    
    let userEmbedding = null
    if (userInterestsText.trim()) {
      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: userInterestsText,
          dimensions: 1536
        })
      })

      if (embeddingResponse.ok) {
        const embeddingData = await embeddingResponse.json()
        userEmbedding = embeddingData.data[0].embedding
      }
    }

    // Get public circles with their recent activity
    const { data: publicCircles, error: publicCirclesError } = await supabase
      .from('circles')
      .select(`
        id,
        name,
        visibility,
        created_at,
        circle_members (count),
        sprints (
          topic,
          tags,
          created_at,
          summaries (
            bullets,
            tags,
            embedding
          )
        )
      `)
      .eq('visibility', 'public')
      .not('id', 'in', `(${userCircleIds.join(',')})`)
      .order('created_at', { ascending: false })

    if (publicCirclesError) {
      throw publicCirclesError
    }

    // Calculate similarity scores for each circle
    const circleScores = await Promise.all(
      publicCircles.map(async (circle: any) => {
        let score = 0
        let reasons = []

        // Topic overlap scoring
        const circleTopics = circle.sprints?.map((s: any) => s.topic).filter(Boolean) || []
        const topicOverlap = circleTopics.filter((topic: string) => 
          userTopics.some(userTopic => 
            userTopic.toLowerCase().includes(topic.toLowerCase()) || 
            topic.toLowerCase().includes(userTopic.toLowerCase())
          )
        ).length

        if (topicOverlap > 0) {
          score += topicOverlap * 10
          reasons.push(`Similar study topics: ${topicOverlap} matches`)
        }

        // Tag overlap scoring
        const circleTags = circle.sprints?.flatMap((s: any) => s.tags || []).filter(Boolean) || []
        const tagOverlap = circleTags.filter((tag: string) => 
          allUserTags.some(userTag => 
            userTag.toLowerCase() === tag.toLowerCase()
          )
        ).length

        if (tagOverlap > 0) {
          score += tagOverlap * 5
          reasons.push(`Common study areas: ${tagOverlap} tag matches`)
        }

        // Vector similarity scoring (if we have embeddings)
        if (userEmbedding && circle.sprints?.length > 0) {
          const circleEmbeddings = circle.sprints
            .map((s: any) => s.summaries?.embedding)
            .filter(Boolean)

          if (circleEmbeddings.length > 0) {
            // Calculate average similarity with circle's content
            const similarities = circleEmbeddings.map((embedding: number[]) => {
              // Cosine similarity calculation
              const dotProduct = userEmbedding.reduce((sum: number, val: number, i: number) => 
                sum + val * embedding[i], 0)
              const magnitudeA = Math.sqrt(userEmbedding.reduce((sum: number, val: number) => 
                sum + val * val, 0))
              const magnitudeB = Math.sqrt(embedding.reduce((sum: number, val: number) => 
                sum + val * val, 0))
              return dotProduct / (magnitudeA * magnitudeB)
            })

            const avgSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length
            if (avgSimilarity > 0.7) {
              score += avgSimilarity * 20
              reasons.push(`Content similarity: ${(avgSimilarity * 100).toFixed(1)}% match`)
            }
          }
        }

        // Activity level scoring
        const recentSprints = circle.sprints?.filter((s: any) => 
          new Date(s.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        ).length || 0

        if (recentSprints > 0) {
          score += recentSprints * 2
          reasons.push(`Active community: ${recentSprints} recent sprints`)
        }

        // Member count factor (not too empty, not too overwhelming)
        const memberCount = circle.circle_members?.[0]?.count || 0
        if (memberCount >= 3 && memberCount <= 50) {
          score += 5
          reasons.push(`Good size: ${memberCount} members`)
        }

        return {
          ...circle,
          score,
          reasons,
          member_count: memberCount,
          recent_activity: recentSprints
        }
      })
    )

    // Sort by score and take top suggestions
    const topSuggestions = circleScores
      .filter(circle => circle.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(circle => ({
        id: circle.id,
        name: circle.name,
        member_count: circle.member_count,
        recent_activity: circle.recent_activity,
        score: circle.score,
        reasons: circle.reasons,
        similarity_reason: circle.reasons.join(', ')
      }))

    return new Response(
      JSON.stringify({ 
        success: true, 
        suggestions: topSuggestions,
        message: 'Circle suggestions generated using RAG and user study history'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error generating circle suggestions:', error)
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