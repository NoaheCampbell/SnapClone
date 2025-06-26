/// <reference types="https://deno.land/x/supabase@1.6.0/mod.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars')
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

Deno.serve(async () => {
  try {
    const nowIso = new Date().toISOString()
    const { data: users, error } = await supabase
      .rpc('get_users_needing_reminder', { now_iso: nowIso })

    if (error) throw error
    if (!users || users.length === 0) {
      return new Response('no users', { headers: corsHeaders })
    }

    const messages = users.map((u: any) => ({
      to: u.expo_push_token,
      sound: 'default',
      title: 'Keep your streak alive! 🔥',
      body: 'Start a 20-minute sprint and ace the quiz before midnight.',
    }))

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages)
    })

    return new Response(`sent ${messages.length}`, { headers: corsHeaders })
  } catch (e) {
    console.error('sendStreakReminders error', e)
    return new Response('error', { status: 500, headers: corsHeaders })
  }
}) 