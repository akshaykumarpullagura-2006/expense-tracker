-- ============================================================
-- THE SPLIT EXPENSES – Full Database Migration
-- Run this in: Supabase → SQL Editor → New Query → Run
-- ============================================================

-- ─── EXTENSIONS ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── PROFILES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name          TEXT,
  email              TEXT NOT NULL,
  avatar_url         TEXT,
  phone              TEXT,
  preferred_currency TEXT NOT NULL DEFAULT 'INR',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"   ON public.profiles FOR SELECT  USING (auth.uid() = id);
CREATE POLICY "profiles_update_own"   ON public.profiles FOR UPDATE  USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own"   ON public.profiles FOR INSERT  WITH CHECK (auth.uid() = id);

-- Allow authenticated users to look up other members by email (for invitation checks)
CREATE POLICY "profiles_select_by_email" ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
    SET email      = EXCLUDED.email,
        full_name  = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
        updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── GROUPS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  description TEXT,
  type        TEXT NOT NULL DEFAULT 'general'
                CHECK (type IN ('trip','friends','family','roommates','college','office','event','general')),
  cover_image TEXT,
  created_by  UUID NOT NULL REFERENCES public.profiles(id),
  currency    TEXT NOT NULL DEFAULT 'INR'
                CHECK (currency IN ('INR','USD','EUR','GBP','AED','SGD','JPY','CAD','AUD','CHF')),
  start_date  DATE,
  end_date    DATE,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_created_by ON public.groups(created_by);
CREATE INDEX IF NOT EXISTS idx_groups_status      ON public.groups(status);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- ─── GROUP MEMBERS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.group_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  status    TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group  ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user   ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_status ON public.group_members(group_id, status);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Groups RLS: readable/writable only by members
CREATE POLICY "groups_select_member" ON public.groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = id AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

CREATE POLICY "groups_insert_auth" ON public.groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "groups_update_admin" ON public.groups FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = id AND gm.user_id = auth.uid() AND gm.role = 'admin' AND gm.status = 'active'
    )
  );

-- Group members RLS
CREATE POLICY "gm_select_member" ON public.group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm2
      WHERE gm2.group_id = group_id AND gm2.user_id = auth.uid() AND gm2.status = 'active'
    )
  );

CREATE POLICY "gm_insert_admin" ON public.group_members FOR INSERT
  WITH CHECK (
    -- creator seeding themselves as admin
    auth.uid() = user_id
    OR
    -- admin adding someone
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role = 'admin' AND gm.status = 'active'
    )
  );

CREATE POLICY "gm_update_admin" ON public.group_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role = 'admin' AND gm.status = 'active'
    )
  );

-- ─── INVITATIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  invited_by  UUID NOT NULL REFERENCES public.profiles(id),
  token_hash  TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','declined','expired','revoked')),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_by UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_group  ON public.invitations(group_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email  ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.invitations(status);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_select_admin_or_invitee" ON public.invitations FOR SELECT
  USING (
    -- admin of the group can see all invitations
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role = 'admin' AND gm.status = 'active'
    )
    OR
    -- invitee can see their own invitation
    email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "inv_insert_admin" ON public.invitations FOR INSERT
  WITH CHECK (
    auth.uid() = invited_by AND
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role = 'admin' AND gm.status = 'active'
    )
  );

CREATE POLICY "inv_update_admin_or_invitee" ON public.invitations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role = 'admin' AND gm.status = 'active'
    )
    OR
    email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ─── CATEGORIES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT '📋',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cat_select_member" ON public.categories FOR SELECT
  USING (
    group_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

CREATE POLICY "cat_insert_member" ON public.categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

-- Seed global categories (run once)
INSERT INTO public.categories (id, group_id, name, icon) VALUES
  (gen_random_uuid(), NULL, 'Food',           '🍔'),
  (gen_random_uuid(), NULL, 'Travel',         '✈️'),
  (gen_random_uuid(), NULL, 'Accommodation',  '🏨'),
  (gen_random_uuid(), NULL, 'Transport',      '🚗'),
  (gen_random_uuid(), NULL, 'Tickets',        '🎟️'),
  (gen_random_uuid(), NULL, 'Shopping',       '🛍️'),
  (gen_random_uuid(), NULL, 'Entertainment',  '🎬'),
  (gen_random_uuid(), NULL, 'Groceries',      '🛒'),
  (gen_random_uuid(), NULL, 'Medical',        '💊'),
  (gen_random_uuid(), NULL, 'Utilities',      '💡'),
  (gen_random_uuid(), NULL, 'Fuel',           '⛽'),
  (gen_random_uuid(), NULL, 'Other',          '📋')
ON CONFLICT DO NOTHING;

-- ─── EXPENSES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency     TEXT NOT NULL,
  category_id  UUID REFERENCES public.categories(id),
  paid_by      UUID NOT NULL REFERENCES public.profiles(id),
  created_by   UUID NOT NULL REFERENCES public.profiles(id),
  split_type   TEXT NOT NULL DEFAULT 'equal' CHECK (split_type IN ('equal','selected')),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description  TEXT,
  receipt_url  TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_group    ON public.expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by  ON public.expenses(paid_by);
CREATE INDEX IF NOT EXISTS idx_expenses_date     ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_status   ON public.expenses(status);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exp_select_member" ON public.expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

CREATE POLICY "exp_insert_member" ON public.expenses FOR INSERT
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

CREATE POLICY "exp_update_creator_or_admin" ON public.expenses FOR UPDATE
  USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role = 'admin' AND gm.status = 'active'
    )
  );

-- ─── EXPENSE SPLITS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_splits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id   UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  group_id     UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id),
  share_minor  BIGINT NOT NULL CHECK (share_minor > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (expense_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_splits_expense ON public.expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_splits_group   ON public.expense_splits(group_id);
CREATE INDEX IF NOT EXISTS idx_splits_user    ON public.expense_splits(user_id);

ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "splits_select_member" ON public.expense_splits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

CREATE POLICY "splits_insert_member" ON public.expense_splits FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

CREATE POLICY "splits_delete_member" ON public.expense_splits FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      JOIN public.group_members gm ON gm.group_id = e.group_id
      WHERE e.id = expense_id AND gm.user_id = auth.uid() AND (e.created_by = auth.uid() OR gm.role = 'admin') AND gm.status = 'active'
    )
  );

-- ─── SETTLEMENTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.settlements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  from_user_id          UUID NOT NULL REFERENCES public.profiles(id),
  to_user_id            UUID NOT NULL REFERENCES public.profiles(id),
  amount_minor          BIGINT NOT NULL CHECK (amount_minor > 0),
  currency              TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','payment_reported','confirmed','rejected','cancelled')),
  payment_method        TEXT,
  transaction_reference TEXT,
  proof_url             TEXT,
  created_by            UUID NOT NULL REFERENCES public.profiles(id),
  confirmed_by          UUID REFERENCES public.profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at          TIMESTAMPTZ,
  CONSTRAINT no_self_settlement CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_settlements_group    ON public.settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_settlements_from     ON public.settlements(from_user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_to       ON public.settlements(to_user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status   ON public.settlements(status);

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "set_select_member" ON public.settlements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

CREATE POLICY "set_insert_member" ON public.settlements FOR INSERT
  WITH CHECK (
    auth.uid() = created_by AND auth.uid() = from_user_id AND
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

CREATE POLICY "set_update_participant" ON public.settlements FOR UPDATE
  USING (
    auth.uid() = from_user_id OR auth.uid() = to_user_id OR
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.role = 'admin' AND gm.status = 'active'
    )
  );

-- ─── ACTIVITY LOGS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  actor_id        UUID NOT NULL REFERENCES public.profiles(id),
  action_type     TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID,
  previous_values JSONB,
  new_values      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_group   ON public.activity_logs(group_id);
CREATE INDEX IF NOT EXISTS idx_activity_actor   ON public.activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON public.activity_logs(created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "log_select_member" ON public.activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

CREATE POLICY "log_insert_member" ON public.activity_logs FOR INSERT
  WITH CHECK (
    auth.uid() = actor_id AND
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id AND gm.user_id = auth.uid() AND gm.status = 'active'
    )
  );

-- ─── NOTIFICATIONS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id   UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user    ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_read    ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created ON public.notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select_own" ON public.notifications FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "notif_insert_sys" ON public.notifications FOR INSERT  WITH CHECK (TRUE);

-- ─── STORAGE BUCKETS (run separately if needed) ──────────────
-- INSERT INTO storage.buckets (id, name, public) VALUES
--   ('profile-images',   'profile-images',   false),
--   ('group-covers',     'group-covers',      false),
--   ('expense-receipts', 'expense-receipts',  false),
--   ('settlement-proofs','settlement-proofs', false)
-- ON CONFLICT DO NOTHING;

-- ─── HELPER FUNCTION: get_group_balances ─────────────────────
CREATE OR REPLACE FUNCTION public.get_group_balances(p_group_id UUID)
RETURNS TABLE (
  user_id              UUID,
  total_paid_minor     BIGINT,
  total_share_minor    BIGINT,
  confirmed_in_minor   BIGINT,
  confirmed_out_minor  BIGINT,
  net_balance_minor    BIGINT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH members AS (
    SELECT user_id FROM public.group_members
    WHERE group_id = p_group_id AND status = 'active'
  ),
  paid AS (
    SELECT paid_by AS user_id, SUM(amount_minor) AS total
    FROM public.expenses
    WHERE group_id = p_group_id AND status = 'active'
    GROUP BY paid_by
  ),
  shares AS (
    SELECT user_id, SUM(share_minor) AS total
    FROM public.expense_splits
    WHERE group_id = p_group_id
    GROUP BY user_id
  ),
  s_in AS (
    SELECT to_user_id AS user_id, SUM(amount_minor) AS total
    FROM public.settlements
    WHERE group_id = p_group_id AND status = 'confirmed'
    GROUP BY to_user_id
  ),
  s_out AS (
    SELECT from_user_id AS user_id, SUM(amount_minor) AS total
    FROM public.settlements
    WHERE group_id = p_group_id AND status = 'confirmed'
    GROUP BY from_user_id
  )
  SELECT
    m.user_id,
    COALESCE(p.total, 0)   AS total_paid_minor,
    COALESCE(sh.total, 0)  AS total_share_minor,
    COALESCE(si.total, 0)  AS confirmed_in_minor,
    COALESCE(so.total, 0)  AS confirmed_out_minor,
    COALESCE(p.total, 0) - COALESCE(sh.total, 0)
      + COALESCE(si.total, 0) - COALESCE(so.total, 0) AS net_balance_minor
  FROM members m
  LEFT JOIN paid   p  ON p.user_id  = m.user_id
  LEFT JOIN shares sh ON sh.user_id = m.user_id
  LEFT JOIN s_in   si ON si.user_id = m.user_id
  LEFT JOIN s_out  so ON so.user_id = m.user_id;
$$;

-- ─── ACCEPT INVITATION FUNCTION ──────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_invitation(p_invitation_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv  public.invitations%ROWTYPE;
  v_user UUID := auth.uid();
  v_email TEXT;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = v_user;

  SELECT * INTO v_inv FROM public.invitations WHERE id = p_invitation_id;

  IF v_inv IS NULL THEN
    RETURN jsonb_build_object('error', 'Invitation not found');
  END IF;
  IF v_inv.email <> v_email THEN
    RETURN jsonb_build_object('error', 'This invitation was not sent to your email');
  END IF;
  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('error', 'Invitation is no longer pending');
  END IF;
  IF v_inv.expires_at < NOW() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = p_invitation_id;
    RETURN jsonb_build_object('error', 'Invitation has expired');
  END IF;

  -- Add as member
  INSERT INTO public.group_members (group_id, user_id, role, status)
  VALUES (v_inv.group_id, v_user, 'member', 'active')
  ON CONFLICT (group_id, user_id) DO UPDATE SET status = 'active';

  -- Mark accepted
  UPDATE public.invitations
  SET status = 'accepted', accepted_by = v_user
  WHERE id = p_invitation_id;

  RETURN jsonb_build_object('success', true, 'group_id', v_inv.group_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_balances TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation  TO authenticated;

