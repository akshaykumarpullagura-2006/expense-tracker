-- ============================================================
-- THE SPLIT EXPENSES: 6-DIGIT INVITES, PAIRWISE DEBTS & SETTLEMENT CONFIRMATION
-- Copy and paste this script into Supabase SQL Editor and click RUN.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 6-DIGIT / 6-CHARACTER UNIQUE GROUP INVITE CODE
-- ------------------------------------------------------------

-- Add invite_code column to groups
ALTER TABLE public.groups
ADD COLUMN IF NOT EXISTS invite_code VARCHAR(10) UNIQUE;

-- Generator function for random 6-character unique uppercase code
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

-- Populate existing groups with 6-char UUID prefix if null
UPDATE public.groups
SET invite_code = UPPER(SUBSTRING(REPLACE(id::TEXT, '-', '') FROM 1 FOR 6))
WHERE invite_code IS NULL;

-- Trigger to automatically set invite_code on new group creation
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

-- RPC Function: Preview group by 6-char code
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

-- RPC Function: Join group by 6-char code
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

  INSERT INTO public.group_members (group_id, user_id, role, status)
  VALUES (v_group.id, v_user_id, 'member', 'active')
  ON CONFLICT (group_id, user_id)
  DO UPDATE SET status = 'active';

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

-- ------------------------------------------------------------
-- 2. TWO-PARTY SETTLEMENT CONFIRMATION FLOW
-- ------------------------------------------------------------

-- Ensure recipient or group admin can update settlement status
DROP POLICY IF EXISTS "set_update_participant" ON public.settlements;
DROP POLICY IF EXISTS "set_update_member" ON public.settlements;

CREATE POLICY "set_update_participant" ON public.settlements FOR UPDATE
  USING (
    auth.uid() = from_user_id
    OR auth.uid() = to_user_id
    OR public.is_group_admin(group_id, auth.uid())
  );

-- RPC Function: Confirm Settlement Payment (Called when recipient clicks "Yes, Confirm Settled")
CREATE OR REPLACE FUNCTION public.confirm_settlement_payment(p_settlement_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_set public.settlements%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_actor_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'You must be logged in to confirm payments');
  END IF;

  SELECT * INTO v_set FROM public.settlements WHERE id = p_settlement_id;

  IF v_set.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Settlement record not found');
  END IF;

  -- Only recipient (to_user_id) or group admin can confirm payment
  IF v_set.to_user_id <> v_user_id AND NOT public.is_group_admin(v_set.group_id, v_user_id) THEN
    RETURN jsonb_build_object('error', 'Only the person receiving the payment can confirm it');
  END IF;

  IF v_set.status = 'confirmed' THEN
    RETURN jsonb_build_object('error', 'This settlement has already been confirmed');
  END IF;

  -- Mark settlement as confirmed
  UPDATE public.settlements
  SET status = 'confirmed',
      confirmed_by = v_user_id,
      confirmed_at = NOW()
  WHERE id = p_settlement_id;

  -- Notify the sender that payment was verified
  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_user_id;
  INSERT INTO public.notifications (user_id, group_id, type, title, message)
  VALUES (
    v_set.from_user_id,
    v_set.group_id,
    'settlement_confirmed',
    'Payment Confirmed!',
    COALESCE(v_actor_name, 'The recipient') || ' confirmed receipt of your payment. Debt has been cleared!'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payment confirmed! Debt balance is now settled.'
  );
END;
$$;

-- RPC Function: Reject Settlement Payment (Called when recipient clicks "Not Received")
CREATE OR REPLACE FUNCTION public.reject_settlement_payment(p_settlement_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_set public.settlements%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_actor_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'You must be logged in to reject payments');
  END IF;

  SELECT * INTO v_set FROM public.settlements WHERE id = p_settlement_id;

  IF v_set.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Settlement record not found');
  END IF;

  IF v_set.to_user_id <> v_user_id AND NOT public.is_group_admin(v_set.group_id, v_user_id) THEN
    RETURN jsonb_build_object('error', 'Only the recipient can reject this payment');
  END IF;

  UPDATE public.settlements
  SET status = 'rejected'
  WHERE id = p_settlement_id;

  -- Notify sender
  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_user_id;
  INSERT INTO public.notifications (user_id, group_id, type, title, message)
  VALUES (
    v_set.from_user_id,
    v_set.group_id,
    'settlement_rejected',
    'Payment Not Confirmed',
    COALESCE(v_actor_name, 'The recipient') || ' reported they have not received your payment.'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payment marked as not received.'
  );
END;
$$;

-- ------------------------------------------------------------
-- 3. PAIRWISE DEBTS & BALANCES RPC
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_group_pairwise_debts(p_group_id UUID)
RETURNS TABLE (
  debtor_id      UUID,
  creditor_id    UUID,
  amount_minor   BIGINT,
  debtor_name    TEXT,
  creditor_name  TEXT,
  currency       TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_currency TEXT;
BEGIN
  SELECT g.currency INTO v_currency FROM public.groups g WHERE g.id = p_group_id;

  RETURN QUERY
  WITH raw_debts AS (
    SELECT
      s.user_id AS debtor,
      e.paid_by AS creditor,
      SUM(s.share_minor) AS debt_amount
    FROM public.expenses e
    JOIN public.expense_splits s ON s.expense_id = e.id
    WHERE e.group_id = p_group_id
      AND e.status = 'active'
      AND s.user_id <> e.paid_by
    GROUP BY s.user_id, e.paid_by

    UNION ALL

    SELECT
      st.from_user_id AS debtor,
      st.to_user_id   AS creditor,
      -SUM(st.amount_minor) AS debt_amount
    FROM public.settlements st
    WHERE st.group_id = p_group_id
      AND st.status = 'confirmed'
      AND st.from_user_id <> st.to_user_id
    GROUP BY st.from_user_id, st.to_user_id
  ),
  aggregated_debts AS (
    SELECT
      r.debtor,
      r.creditor,
      SUM(r.debt_amount) AS total_debt
    FROM raw_debts r
    GROUP BY r.debtor, r.creditor
  ),
  netted_debts AS (
    SELECT
      CASE WHEN a.total_debt - COALESCE(b.total_debt, 0) > 0 THEN a.debtor ELSE a.creditor END AS final_debtor,
      CASE WHEN a.total_debt - COALESCE(b.total_debt, 0) > 0 THEN a.creditor ELSE a.debtor END AS final_creditor,
      ABS(a.total_debt - COALESCE(b.total_debt, 0)) AS final_amount
    FROM aggregated_debts a
    LEFT JOIN aggregated_debts b ON a.debtor = b.creditor AND a.creditor = b.debtor
    WHERE a.debtor < a.creditor
      AND (a.total_debt - COALESCE(b.total_debt, 0)) <> 0
  )
  SELECT
    nd.final_debtor AS debtor_id,
    nd.final_creditor AS creditor_id,
    nd.final_amount AS amount_minor,
    COALESCE(dp.full_name, split_part(dp.email, '@', 1)) AS debtor_name,
    COALESCE(cp.full_name, split_part(cp.email, '@', 1)) AS creditor_name,
    v_currency AS currency
  FROM netted_debts nd
  JOIN public.profiles dp ON dp.id = nd.final_debtor
  JOIN public.profiles cp ON cp.id = nd.final_creditor
  WHERE nd.final_amount > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_give_take_balances(p_group_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_give_to JSONB;
  v_take_from JSONB;
  v_total_give BIGINT;
  v_total_take BIGINT;
BEGIN
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'user_id', creditor_id,
        'user_name', creditor_name,
        'amount_minor', amount_minor
      )
    ), '[]'::jsonb),
    COALESCE(SUM(amount_minor), 0)
  INTO v_give_to, v_total_give
  FROM public.get_group_pairwise_debts(p_group_id)
  WHERE debtor_id = p_user_id;

  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'user_id', debtor_id,
        'user_name', debtor_name,
        'amount_minor', amount_minor
      )
    ), '[]'::jsonb),
    COALESCE(SUM(amount_minor), 0)
  INTO v_take_from, v_total_take
  FROM public.get_group_pairwise_debts(p_group_id)
  WHERE creditor_id = p_user_id;

  RETURN jsonb_build_object(
    'group_id', p_group_id,
    'user_id', p_user_id,
    'total_give_minor', v_total_give,
    'give_to', v_give_to,
    'total_take_minor', v_total_take,
    'take_from', v_take_from,
    'net_balance_minor', v_total_take - v_total_give
  );
END;
$$;

-- ------------------------------------------------------------
-- 4. GRANT PERMISSIONS
-- ------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.get_group_preview_by_code TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.join_group_by_code TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_settlement_payment TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_settlement_payment  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_pairwise_debts TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_give_take_balances TO authenticated, anon;

-- ------------------------------------------------------------
-- 5. REGISTRATION: SAVE MOBILE NUMBER TO PROFILES
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO UPDATE
    SET email      = EXCLUDED.email,
        full_name  = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
        phone      = COALESCE(EXCLUDED.phone, public.profiles.phone),
        updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


