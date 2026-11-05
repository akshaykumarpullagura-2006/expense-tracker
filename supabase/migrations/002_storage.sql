-- Storage buckets and policies
-- Run this AFTER the main migration

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('profile-images',    'profile-images',    false, 5242880,  ARRAY['image/jpeg','image/png','image/webp']),
  ('group-covers',      'group-covers',      false, 5242880,  ARRAY['image/jpeg','image/png','image/webp']),
  ('expense-receipts',  'expense-receipts',  false, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('settlement-proofs', 'settlement-proofs', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Profile images: owner can upload/view their own
CREATE POLICY "profile_images_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'profile-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "profile_images_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Group covers: group admin can upload
CREATE POLICY "group_covers_upload" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'group-covers' AND
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id::text = (storage.foldername(name))[1]
        AND gm.user_id = auth.uid() AND gm.role = 'admin' AND gm.status = 'active'
    )
  );

CREATE POLICY "group_covers_read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'group-covers' AND
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id::text = (storage.foldername(name))[1]
        AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

-- Expense receipts: group members can upload and read
CREATE POLICY "receipts_upload" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'expense-receipts' AND
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id::text = (storage.foldername(name))[1]
        AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

CREATE POLICY "receipts_read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'expense-receipts' AND
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id::text = (storage.foldername(name))[1]
        AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

-- Settlement proofs
CREATE POLICY "proofs_upload" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'settlement-proofs' AND
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id::text = (storage.foldername(name))[1]
        AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

CREATE POLICY "proofs_read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'settlement-proofs' AND
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id::text = (storage.foldername(name))[1]
        AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

