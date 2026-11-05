-- ============================================================
-- FIX: RECURSIVE RLS POLICIES FOR group_members & groups
-- Run this in Supabase SQL Editor to resolve the infinite recursion error
-- ============================================================

-- 1. Helper function that queries group membership WITHOUT triggering RLS recursively
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
      AND status = 'active'
  );
$$;

-- 2. Helper function to check if user is a group admin
CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
      AND role = 'admin'
      AND status = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_group_member TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_group_admin TO authenticated, anon;

-- 3. Drop recursive policies on group_members
DROP POLICY IF EXISTS "gm_select_member" ON public.group_members;
DROP POLICY IF EXISTS "gm_insert_admin"  ON public.group_members;
DROP POLICY IF EXISTS "gm_update_admin"  ON public.group_members;

-- 4. Re-create clean non-recursive policies on group_members
CREATE POLICY "gm_select_member" ON public.group_members FOR SELECT
  USING (
    user_id = auth.uid() OR public.is_group_member(group_id, auth.uid())
  );

CREATE POLICY "gm_insert_member" ON public.group_members FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR public.is_group_admin(group_id, auth.uid())
  );

CREATE POLICY "gm_update_member" ON public.group_members FOR UPDATE
  USING (
    public.is_group_admin(group_id, auth.uid())
  );

-- 5. Drop and recreate clean policies on groups
DROP POLICY IF EXISTS "groups_select_member" ON public.groups;
DROP POLICY IF EXISTS "groups_update_admin"  ON public.groups;

CREATE POLICY "groups_select_member" ON public.groups FOR SELECT
  USING (
    created_by = auth.uid() OR public.is_group_member(id, auth.uid())
  );

CREATE POLICY "groups_update_admin" ON public.groups FOR UPDATE
  USING (
    public.is_group_admin(id, auth.uid())
  );

-- 6. Also update other dependent policies to use the fast SECURITY DEFINER helpers
DROP POLICY IF EXISTS "inv_select_admin_or_invitee" ON public.invitations;
DROP POLICY IF EXISTS "inv_select" ON public.invitations;
CREATE POLICY "inv_select" ON public.invitations FOR SELECT
  USING (
    public.is_group_admin(group_id, auth.uid())
    OR email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "inv_insert_admin" ON public.invitations;
DROP POLICY IF EXISTS "inv_insert" ON public.invitations;
CREATE POLICY "inv_insert" ON public.invitations FOR INSERT
  WITH CHECK (
    auth.uid() = invited_by AND public.is_group_admin(group_id, auth.uid())
  );

DROP POLICY IF EXISTS "exp_select_member" ON public.expenses;
CREATE POLICY "exp_select_member" ON public.expenses FOR SELECT
  USING (public.is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "exp_insert_member" ON public.expenses;
CREATE POLICY "exp_insert_member" ON public.expenses FOR INSERT
  WITH CHECK (auth.uid() = created_by AND public.is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "splits_select_member" ON public.expense_splits;
CREATE POLICY "splits_select_member" ON public.expense_splits FOR SELECT
  USING (public.is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "splits_insert_member" ON public.expense_splits;
CREATE POLICY "splits_insert_member" ON public.expense_splits FOR INSERT
  WITH CHECK (public.is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "set_select_member" ON public.settlements;
CREATE POLICY "set_select_member" ON public.settlements FOR SELECT
  USING (public.is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "set_insert_member" ON public.settlements;
CREATE POLICY "set_insert_member" ON public.settlements FOR INSERT
  WITH CHECK (auth.uid() = created_by AND auth.uid() = from_user_id AND public.is_group_member(group_id, auth.uid()));

