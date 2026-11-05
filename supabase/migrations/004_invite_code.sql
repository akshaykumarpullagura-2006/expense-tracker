-- ============================================================
-- 004: 6-DIGIT / 6-CHARACTER UNIQUE GROUP INVITE CODES
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add invite_code column to groups table
ALTER TABLE public.groups
ADD COLUMN IF NOT EXISTS invite_code VARCHAR(10) UNIQUE;

-- 2. Generator function for random 6-character unique uppercase code
CREATE OR REPLACE FUNCTION public.generate_unique_group_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code  TEXT := '';
  v_i     INT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_code := '';
    FOR v_i IN 1..6 LOOP
      v_code := v_code || SUBSTR(v_chars, FLOOR(RANDOM() * LENGTH(v_chars) + 1)::INT, 1);
    END LOOP;

    SELECT EXISTS (SELECT 1 FROM public.groups WHERE invite_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

-- 3. Populate existing groups: use their 6-char UUID prefix or unique code
UPDATE public.groups
SET invite_code = UPPER(SUBSTRING(REPLACE(id::TEXT, '-', '') FROM 1 FOR 6))
WHERE invite_code IS NULL;

-- 4. Trigger to ensure every new group automatically gets an invite_code if not supplied
CREATE OR REPLACE FUNCTION public.set_group_invite_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invite_code IS NULL OR TRIM(NEW.invite_code) = '' THEN
    NEW.invite_code := public.generate_unique_group_code();
  ELSE
    NEW.invite_code := UPPER(TRIM(NEW.invite_code));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_invite_code ON public.groups;
CREATE TRIGGER trg_group_invite_code
  BEFORE INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.set_group_invite_code();

-- 5. RPC function to preview group by invite code or 6-char prefix (Public/Anon accessible)
CREATE OR REPLACE FUNCTION public.get_group_preview_by_code(p_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group public.groups%ROWTYPE;
  v_creator_name TEXT;
  v_member_count INT;
  v_clean_code TEXT;
BEGIN
  v_clean_code := UPPER(TRIM(p_code));

  SELECT * INTO v_group
  FROM public.groups
  WHERE (
    invite_code = v_clean_code
    OR REPLACE(id::TEXT, '-', '') ILIKE v_clean_code || '%'
  )
  AND status = 'active'
  LIMIT 1;

  IF v_group.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Group not found or invalid invite code');
  END IF;

  SELECT full_name INTO v_creator_name FROM public.profiles WHERE id = v_group.created_by;
  SELECT COUNT(*) INTO v_member_count FROM public.group_members WHERE group_id = v_group.id AND status = 'active';

  RETURN jsonb_build_object(
    'id', v_group.id,
    'name', v_group.name,
    'description', v_group.description,
    'type', v_group.type,
    'currency', v_group.currency,
    'created_by_name', COALESCE(v_creator_name, 'Group Admin'),
    'member_count', v_member_count,
    'invite_code', COALESCE(v_group.invite_code, UPPER(SUBSTRING(REPLACE(v_group.id::TEXT, '-', '') FROM 1 FOR 6)))
  );
END;
$$;

-- 6. RPC function to join a group by 6-digit invite code or prefix (Authenticated users)
CREATE OR REPLACE FUNCTION public.join_group_by_code(p_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group public.groups%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_clean_code TEXT;
  v_is_already_member BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'You must be signed in to join this group');
  END IF;

  v_clean_code := UPPER(TRIM(p_code));

  SELECT * INTO v_group
  FROM public.groups
  WHERE (
    invite_code = v_clean_code
    OR REPLACE(id::TEXT, '-', '') ILIKE v_clean_code || '%'
  )
  AND status = 'active'
  LIMIT 1;

  IF v_group.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid group code. Please check and try again.');
  END IF;

  -- Check if user is already an active member
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = v_group.id AND user_id = v_user_id AND status = 'active'
  ) INTO v_is_already_member;

  IF v_is_already_member THEN
    RETURN jsonb_build_object(
      'success', true,
      'group_id', v_group.id,
      'group_name', v_group.name,
      'already_member', true,
      'message', 'You are already a member of this group!'
    );
  END IF;

  -- Insert or reactivate membership
  INSERT INTO public.group_members (group_id, user_id, role, status)
  VALUES (v_group.id, v_user_id, 'member', 'active')
  ON CONFLICT (group_id, user_id)
  DO UPDATE SET status = 'active';

  -- Record in activity logs
  INSERT INTO public.activity_logs (group_id, actor_id, action_type, entity_type, entity_id, new_values)
  VALUES (
    v_group.id,
    v_user_id,
    'member_joined',
    'group',
    v_group.id,
    jsonb_build_object('join_method', 'invite_code', 'code', v_clean_code)
  );

  RETURN jsonb_build_object(
    'success', true,
    'group_id', v_group.id,
    'group_name', v_group.name,
    'already_member', false,
    'message', 'Successfully joined the group!'
  );
END;
$$;

-- Grant permissions to execute the RPCs
GRANT EXECUTE ON FUNCTION public.get_group_preview_by_code TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.join_group_by_code TO authenticated;
