-- ============================================================
-- THE SPLIT EXPENSES: RESET DATABASE DATA TO ZERO
-- Wipes all test data (groups, expenses, splits, debts, settlements, notifications)
-- WITHOUT destroying or dropping any tables, schemas, triggers, or RLS policies.
-- Run this in your Supabase Dashboard -> SQL Editor -> New Query.
-- ============================================================

-- Step 1: Wipe all group expenses, splits, debts, settlements, activity, and groups
TRUNCATE TABLE 
  public.notifications,
  public.activity_logs,
  public.settlements,
  public.expense_splits,
  public.expenses,
  public.invitations,
  public.group_members,
  public.groups
CASCADE;

-- Step 2: (Choose one of the options below for user accounts)

-- OPTION A (Default): Keep your registered user logins intact, so you don't need to sign up again.
-- (Nothing more needed, Step 1 already reset all expenses, groups, and debts to 0!)

-- OPTION B: Total Fresh Reset (also delete all registered users so you can sign up from scratch)
-- If you want this, uncomment the lines below before running:
-- TRUNCATE TABLE public.profiles CASCADE;
-- DELETE FROM auth.users;
