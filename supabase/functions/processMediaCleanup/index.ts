// Edge Function: processMediaCleanup
// Processes the media_cleanup_queue table and deletes files from storage
// Can be called manually or via cron job

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.5";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Get all pending cleanup items
    const { data: cleanupItems, error: fetchError } = await supabase
      .from('media_cleanup_queue')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(100); // Process in batches

    if (fetchError) {
      console.error('Error fetching cleanup queue:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!cleanupItems || cleanupItems.length === 0) {
      return new Response(JSON.stringify({ 
        message: "No items to process",
        processed: 0 
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Group files by bucket for efficient batch deletion
    const bucketMap: Record<string, { paths: string[], ids: number[] }> = {};
    
    for (const item of cleanupItems) {
      if (!bucketMap[item.bucket]) {
        bucketMap[item.bucket] = { paths: [], ids: [] };
      }
      bucketMap[item.bucket].paths.push(item.path);
      bucketMap[item.bucket].ids.push(item.id);
    }

    const results: Record<string, { deleted: number; errors: unknown[] }> = {};
    const processedIds: number[] = [];

    // Delete files from each bucket
    for (const [bucket, { paths, ids }] of Object.entries(bucketMap)) {
      try {
        const { error: deleteError } = await supabase.storage
          .from(bucket)
          .remove(paths);

        if (deleteError) {
          console.error(`Error deleting from bucket ${bucket}:`, deleteError);
          results[bucket] = {
            deleted: 0,
            errors: [deleteError]
          };
        } else {
          console.log(`Successfully deleted ${paths.length} files from ${bucket}`);
          results[bucket] = {
            deleted: paths.length,
            errors: []
          };
          // Mark these items as processed
          processedIds.push(...ids);
        }
      } catch (error) {
        console.error(`Exception deleting from bucket ${bucket}:`, error);
        results[bucket] = {
          deleted: 0,
          errors: [error]
        };
      }
    }

    // Remove successfully processed items from the queue
    if (processedIds.length > 0) {
      const { error: deleteQueueError } = await supabase
        .from('media_cleanup_queue')
        .delete()
        .in('id', processedIds);

      if (deleteQueueError) {
        console.error('Error removing processed items from queue:', deleteQueueError);
      }
    }

    return new Response(JSON.stringify({
      message: "Media cleanup processed",
      processed: processedIds.length,
      total_queued: cleanupItems.length,
      results
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Media cleanup error:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}); 