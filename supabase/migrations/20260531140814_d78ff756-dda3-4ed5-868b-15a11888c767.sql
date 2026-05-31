-- Create public storage bucket for page/image assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('page-assets', 'page-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Public read page-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'page-assets');

-- Public insert (matches existing permissive RLS on app tables)
CREATE POLICY "Public insert page-assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'page-assets');

-- Public update
CREATE POLICY "Public update page-assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'page-assets');

-- Public delete
CREATE POLICY "Public delete page-assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'page-assets');
