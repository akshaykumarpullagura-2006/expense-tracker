-- ============================================================
-- 006: TWO-PARTY SETTLEMENT CONFIRMATION FLOW
-- Run this in Supabase SQL Editor
-- ============================================================

-- Ensure settlements table allows updates by recipient (to_user_id)
DROP POLICY IF EXISTS "set_update_participant" ON public.settlements;
DROP POLICY IF EXISTS "set_update_member" ON public.settlements;

CREATE POLICY "set_update_participant" ON public.settlements FOR UPDATE
  USING (
    auth.uid() = from_user_id
    OR auth.uid() = to_user_id
    OR public.is_group_admin(group_id, auth.uid())
  );

-- RPC Function: Confirm Settlement Payment (Called by recipient to_user_id)
CREATE OR REPLACE FUNCTION public.confirm_settlement_payment(p_settlement_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_set public.settlements%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_actor_name TEXT;
  v_from_name TEXT;
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

  -- Update settlement status to confirmed
  UPDATE public.settlements
  SET status = 'confirmed',
      confirmed_by = v_user_id,
      confirmed_at = NOW()
  WHERE id = p_settlement_id;

  -- Send notification to the person who paid
  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_user_id;
  INSERT INTO public.notifications (user_id, group_id, type, title, message)
  VALUES (
    v_set.from_user_id,
    v_set.group_id,
    'settlement_confirmed',
    'Payment Confirmed!',
    COALESCE(v_actor_name, 'The recipient') || ' confirmed receipt of your payment. Debt has been settled!'
  );

  -- Record in activity logs
  INSERT INTO public.activity_logs (group_id, actor_id, action_type, entity_type, entity_id, new_values)
  VALUES (
    v_set.group_id,
    v_user_id,
    'settlement_confirmed',
    'settlement',
    v_set.id,
    jsonb_build_object(
      'amount_minor', v_set.amount_minor,
      'from_user_id', v_set.from_user_id,
      'to_user_id', v_set.to_user_id,
      'status', 'confirmed'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payment confirmed! The balance has been officially settled.'
  );
END;
$$;

-- RPC Function: Reject Settlement Payment (Called by recipient to_user_id)
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

  -- Send notification to the person who paid
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

GRANT EXECUTE ON FUNCTION public.confirm_settlement_payment TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_settlement_payment  TO authenticated;

