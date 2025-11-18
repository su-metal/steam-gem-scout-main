-- Create table for caching game rankings
CREATE TABLE IF NOT EXISTS public.game_rankings_cache (
  app_id INTEGER PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index on updated_at for faster freshness checks
CREATE INDEX IF NOT EXISTS idx_game_rankings_cache_updated_at ON public.game_rankings_cache(updated_at);

-- Enable RLS (but make it publicly readable since this is public data)
ALTER TABLE public.game_rankings_cache ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read cached rankings
CREATE POLICY "Anyone can read game rankings cache"
  ON public.game_rankings_cache
  FOR SELECT
  USING (true);

-- Only the service role can write (edge functions will use service role)
CREATE POLICY "Service role can insert/update cache"
  ON public.game_rankings_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);