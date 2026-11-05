-- ============================================================
-- 005: PAIRWISE DEBTS ("GIVE MONEY" & "TAKE MONEY") RPC
-- Run this in Supabase SQL Editor
-- ============================================================

-- Function to get who owes whom in a group with net debt calculation
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
  -- Get group currency
  SELECT g.currency INTO v_currency FROM public.groups g WHERE g.id = p_group_id;

  RETURN QUERY
  WITH raw_debts AS (
    -- Debts arising from expenses: each split member owes the payer their share
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

    -- Deductions from confirmed settlements (from_user paid to_user, so from_user owes to_user less)
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
    -- For each pair (A, B) where A < B, calculate net balance
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

-- Function to get a specific user's "Give Money" and "Take Money" details
CREATE OR REPLACE FUNCTION public.get_user_give_take_balances(p_group_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_give_to JSONB;
  v_take_from JSONB;
  v_total_give BIGINT;
  v_total_take BIGINT;
BEGIN
  -- 1. Give money: who this user needs to give to
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

  -- 2. Take money: who needs to give to this user
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

GRANT EXECUTE ON FUNCTION public.get_group_pairwise_debts TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_give_take_balances TO authenticated, anon;

