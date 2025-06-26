/// <reference types="https://deno.land/x/supabase@1.6.0/mod.ts" />
// Edge Function: updateStreaksDaily
// Calculates the previous local day for every user, updates their individual streaks,
// awards freeze tokens, and updates circle streaks based on 60% participation rule.
// This function is intended to run once a day via Supabase Scheduler (e.g. 02:05 UTC).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase env vars')
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false
  }
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

// Helper to get a JS Date representing midnight (00:00:00) in a user\'s timezone
function getStartOfDay(date: Date, timeZone: string): Date {
  const localeDateString = date.toLocaleDateString('en-CA', { timeZone }) // yyyy-mm-dd
  return new Date(`${localeDateString}T00:00:00${offsetISO(timeZone, date)}`)
}

// Helper to produce the numeric timezone offset (+05:00) for a zone at a given instant
function offsetISO(timeZone: string, date: Date): string {
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone }))
  const offset = (date.getTime() - tzDate.getTime()) / 60000 // in minutes
  const sign = offset > 0 ? '-' : '+'
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
  const hours = pad(offset / 60)
  const mins = pad(offset % 60)
  return `${sign}${hours}:${mins}`
}

async function updateIndividualStreaks() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('user_id, timezone')

  if (error) throw error
  if (!profiles) return

  for (const p of profiles) {
    const tz = p.timezone || 'UTC'
    const now = new Date()

    // Determine yesterday in user local time
    const startToday = getStartOfDay(now, tz)
    const startYesterday = new Date(startToday.getTime() - 24 * 60 * 60 * 1000)
    const endYesterday = new Date(startToday.getTime() - 1)

    // ISO range for query (UTC)
    const startIso = startYesterday.toISOString()
    const endIso = endYesterday.toISOString()

    // Count natural sprints completed yesterday (not stopped early)
    const { count } = await supabase
      .from('sprints')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', p.user_id)
      .eq('counts_for_streak', true)
      .gte('ends_at', startIso)
      .lte('ends_at', endIso)

    if ((count ?? 0) === 0) {
      // Missed day – nothing to do now; daily job only increments streaks.
      continue
    }

    // Upsert streak row
    const { data: existing } = await supabase
      .from('streaks')
      .select('*')
      .eq('user_id', p.user_id)
      .single()

    const yesterdayDateStr = startYesterday.toISOString().split('T')[0]

    if (!existing) {
      await supabase.from('streaks').insert({
        user_id: p.user_id,
        current_len: 1,
        best_len: 1,
        freeze_tokens: 0,
        last_completed_local_date: yesterdayDateStr
      })
      continue
    }

    // If we already counted yesterday, skip
    if (existing.last_completed_local_date === yesterdayDateStr) continue

    const lastDate = existing.last_completed_local_date ? new Date(existing.last_completed_local_date) : null
    let newCurrent = 1
    if (lastDate) {
      const diffDays = Math.round((startYesterday.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000))
      if (diffDays === 1) {
        newCurrent = existing.current_len + 1
      }
    }

    const newBest = Math.max(existing.best_len, newCurrent)
    const newTokens = (newCurrent % 7 === 0) ? existing.freeze_tokens + 1 : existing.freeze_tokens

    await supabase.from('streaks').update({
      current_len: newCurrent,
      best_len: newBest,
      freeze_tokens: newTokens,
      last_completed_local_date: yesterdayDateStr
    }).eq('user_id', p.user_id)
  }
}

async function updateCircleStreaks() {
  // We\'ll consider streaks on a daily basis (previous local day for each circle participant)
  const { data: circles, error } = await supabase.from('circles').select('id, member_count, current_streak, best_streak')
  if (error) throw error
  if (!circles) return

  const today = new Date()
  const startYesterdayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1, 0, 0, 0))
  const endYesterdayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1, 23, 59, 59, 999))

  for (const circle of circles) {
    // Pull member count fresh since it may have changed
    const { data: members, error: memberErr } = await supabase
      .from('circle_members')
      .select('user_id')
      .eq('circle_id', circle.id)
    if (memberErr) throw memberErr

    const memberTotal = members?.length ?? 0
    if (memberTotal === 0) continue

    const { data: active, error: activeErr } = await supabase
      .from('sprints')
      .select('user_id', { distinct: true })
      .eq('circle_id', circle.id)
      .eq('counts_for_streak', true)
      .gte('ends_at', startYesterdayUTC.toISOString())
      .lte('ends_at', endYesterdayUTC.toISOString())

    if (activeErr) throw activeErr

    const activeCount = active?.length ?? 0
    const ratio = activeCount / memberTotal

    let newCurrent = circle.current_streak
    if (ratio >= 0.6) {
      newCurrent = circle.current_streak + 1
    } else {
      newCurrent = 0
    }

    const newBest = Math.max(circle.best_streak, newCurrent)

    await supabase.from('circles').update({
      current_streak: newCurrent,
      best_streak: newBest
    }).eq('id', circle.id)
  }
}

Deno.serve(async (req) => {
  try {
    await updateIndividualStreaks()
    await updateCircleStreaks()
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    console.error('updateStreaksDaily error', e)
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}) 