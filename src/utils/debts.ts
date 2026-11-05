// src/utils/debts.ts
import type { Profile } from '@/types';

export interface PairwiseDebt {
  debtor_id: string;      // Who owes the money (needs to give)
  creditor_id: string;    // Who is owed the money (needs to take)
  amount_minor: number;   // Amount in minor units (paise)
  debtor?: Profile;
  creditor?: Profile;
}

export interface UserGroupBalance {
  // Give money (Outgoing - You Owe)
  total_give_minor: number;
  give_to: Array<{
    user_id: string;
    profile?: Profile;
    amount_minor: number;
  }>;

  // Take money (Incoming - You are Owed)
  total_take_minor: number;
  take_from: Array<{
    user_id: string;
    profile?: Profile;
    amount_minor: number;
  }>;

  // Net balance (positive = net take, negative = net give)
  net_balance_minor: number;
}

/**
 * Calculates pairwise debts between all group members and derives
 * "Give Money" (who you need to give to) and "Take Money" (who you will take from)
 * for a specific user.
 */
export function calculateGroupDebts(
  expenses: Array<{ id: string; amount_minor: number; paid_by: string; status: string }>,
  splits: Array<{ expense_id: string; user_id: string; share_minor: number }>,
  settlements: Array<{ from_user_id: string; to_user_id: string; amount_minor: number; status: string }>,
  membersMap: Map<string, Profile>,
  currentUserId: string
): { allDebts: PairwiseDebt[]; userBalance: UserGroupBalance } {
  // 1. debtMatrix[debtor][creditor] = minor amount debtor owes creditor
  const debtMatrix: Record<string, Record<string, number>> = {};

  function addDebt(debtor: string, creditor: string, amount: number) {
    if (debtor === creditor || amount <= 0) return;
    if (!debtMatrix[debtor]) debtMatrix[debtor] = {};
    debtMatrix[debtor][creditor] = (debtMatrix[debtor][creditor] || 0) + amount;
  }

  function deductDebt(debtor: string, creditor: string, amount: number) {
    if (debtor === creditor || amount <= 0) return;
    if (!debtMatrix[debtor]) debtMatrix[debtor] = {};
    debtMatrix[debtor][creditor] = (debtMatrix[debtor][creditor] || 0) - amount;
  }

  // 2. Process all active expenses and their splits
  const activeExpenses = expenses.filter((e) => e.status === 'active');
  for (const exp of activeExpenses) {
    const payerId = exp.paid_by;
    const expSplits = splits.filter((s) => s.expense_id === exp.id);

    for (const split of expSplits) {
      if (split.user_id !== payerId) {
        // split.user_id owes payerId for their share
        addDebt(split.user_id, payerId, split.share_minor);
      }
    }
  }

  // 3. Process confirmed settlements
  const confirmedSettlements = settlements.filter((s) => s.status === 'confirmed');
  for (const set of confirmedSettlements) {
    // from_user_id paid to_user_id, so reduce from_user_id's debt to to_user_id
    deductDebt(set.from_user_id, set.to_user_id, set.amount_minor);
  }

  // 4. Net out pairs: if A owes B 300 and B owes A 100 => A owes B 200
  const allUserIds = Array.from(membersMap.keys());
  const allDebts: PairwiseDebt[] = [];
  const processedPairs = new Set<string>();

  for (let i = 0; i < allUserIds.length; i++) {
    for (let j = i + 1; j < allUserIds.length; j++) {
      const u1 = allUserIds[i];
      const u2 = allUserIds[j];

      const u1OwesU2 = (debtMatrix[u1]?.[u2] || 0);
      const u2OwesU1 = (debtMatrix[u2]?.[u1] || 0);

      const net = u1OwesU2 - u2OwesU1;

      if (net > 0) {
        // u1 owes u2
        allDebts.push({
          debtor_id: u1,
          creditor_id: u2,
          amount_minor: net,
          debtor: membersMap.get(u1),
          creditor: membersMap.get(u2),
        });
      } else if (net < 0) {
        // u2 owes u1
        allDebts.push({
          debtor_id: u2,
          creditor_id: u1,
          amount_minor: Math.abs(net),
          debtor: membersMap.get(u2),
          creditor: membersMap.get(u1),
        });
      }
    }
  }

  // 5. Build Give Money and Take Money for the logged-in user
  const giveTo: UserGroupBalance['give_to'] = [];
  let totalGive = 0;

  const takeFrom: UserGroupBalance['take_from'] = [];
  let totalTake = 0;

  for (const debt of allDebts) {
    if (debt.debtor_id === currentUserId) {
      // Current user owes creditor
      totalGive += debt.amount_minor;
      giveTo.push({
        user_id: debt.creditor_id,
        profile: debt.creditor,
        amount_minor: debt.amount_minor,
      });
    } else if (debt.creditor_id === currentUserId) {
      // Debtor owes current user
      totalTake += debt.amount_minor;
      takeFrom.push({
        user_id: debt.debtor_id,
        profile: debt.debtor,
        amount_minor: debt.amount_minor,
      });
    }
  }

  return {
    allDebts,
    userBalance: {
      total_give_minor: totalGive,
      give_to: giveTo,
      total_take_minor: totalTake,
      take_from: takeFrom,
      net_balance_minor: totalTake - totalGive,
    },
  };
}

