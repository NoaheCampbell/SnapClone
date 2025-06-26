/// <reference types="https://deno.land/x/supabase@1.6.0/mod.ts" />

// This function should be invoked by a Supabase DB trigger on INSERT to the 'messages' table.
// Configure in Supabase Dashboard → Database → Functions → Triggers:
//   Table: messages, Event: INSERT, Function: sendCircleMessagePush
// It sends Expo push notifications to all circle members except the sender.

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

type MessagePayload = {
  record: {
    id: string
    circle_id: string
    sender_id: string
    content: string
    created_at: string
  }
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json() as MessagePayload
    const { circle_id, sender_id, content } = payload.record

    // Fetch circle members' push tokens (excluding sender)
    const { data: members, error } = await supabase
      .from('circle_members')
      .select('user_id, profiles(expo_push_token, username)')
      .eq('circle_id', circle_id)
      .neq('user_id', sender_id)

    if (error) throw error
    if (!members || members.length === 0) {
      return new Response('no recipients', { headers: corsHeaders })
    }

    const tokens = members
      .map((m: any) => m.profiles?.expo_push_token)
      .filter((t: string | null) => !!t)

    if (tokens.length === 0) {
      return new Response('no tokens', { headers: corsHeaders })
    }

    const senderProfile = await supabase
      .from('profiles')
      .select('username')
      .eq('user_id', sender_id)
      .single()

    const senderName = senderProfile.data?.username || 'Someone'

    const notificationBody = content.length > 100 ? content.slice(0, 97) + '…' : content

    const messages = tokens.map((to: string) => ({
      to,
      sound: 'default',
      title: `${senderName} in your circle`,
      body: notificationBody || 'Sent a photo',
    }))

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages)
    })

    return new Response(`sent ${messages.length} notifications`, { headers: corsHeaders })
  } catch (e) {
    console.error('sendCircleMessagePush error', e)
    return new Response('error', { status: 500, headers: corsHeaders })
  }
}) 