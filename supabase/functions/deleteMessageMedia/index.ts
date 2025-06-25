// deno-lint-ignore-file
// @ts-nocheck
// Edge Function: deleteMessageMedia
// Accepts a POST body of shape { files: [ { bucket: string, path: string } ] }
// Deletes the specified objects from their respective buckets.
// Intended to be invoked by the Postgres cron job that purges messages.
// Example payload:
//   {
//     "files": [
//       { "bucket": "chat-media", "path": "123.jpg" },
//       { "bucket": "chat-media", "path": "124.jpg" },
//       { "bucket": "snaps",      "path": "456.png" }
//     ]
//   }

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.5";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: { files?: Array<{ bucket: string; path: string }> };
  try {
    payload = await req.json();
  } catch (_) {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const files = payload?.files ?? [];
  if (!Array.isArray(files) || files.length === 0) {
    return new Response("'files' must be a non-empty array", { status: 400 });
  }

  // Group paths by bucket for efficient batch deletes
  const bucketMap: Record<string, string[]> = {};
  for (const { bucket, path } of files) {
    if (!bucket || !path) continue;
    bucketMap[bucket] = bucketMap[bucket] || [];
    bucketMap[bucket].push(path);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: Record<string, { deleted: number; errors: unknown[] }> = {};

  for (const [bucket, paths] of Object.entries(bucketMap)) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    results[bucket] = {
      deleted: error ? 0 : paths.length,
      errors: error ? [error] : [],
    };
  }

  return new Response(JSON.stringify({ results }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}); 