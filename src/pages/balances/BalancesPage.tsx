import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import { formatCurrency, getInitials } from '@/utils';
import { calculateGroupDebts, type PairwiseDebt, type UserGroupBalance } from '@/utils/debts';
import { Wallet, TrendingUp, TrendingDown, ArrowRight, CheckCircle2, CheckCircle, Receipt, Share2 } from 'lucide-react';
import type { Group, MemberBalance, Profile } from '@/types';

export default function BalancesPage() {
  const { user, profile } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [balances, setBalances] = useState<MemberBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState('INR');
  const [userBalance, setUserBalance] = useState<UserGroupBalance>({
    total_give_minor: 0,
    give_to: [],
    total_take_minor: 0,
    take_from: [],
    net_balance_minor: 0,
  });
  const [allDebts, setAllDebts] = useState<PairwiseDebt[]>([]);
  const [groupTotalSpent, setGroupTotalSpent] = useState(0);
  const [userPaidTotal, setUserPaidTotal] = useState(0);

  useEffect(() => {
    if (!user) return;
    loadGroups();
  }, [user]);

  useEffect(() => {
    if (!selectedGroup) return;
    loadBalances(selectedGroup);

    // Live realtime channel for instantaneous balance updates
    const channel = supabase
      .channel(`balances_${selectedGroup}_feed`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `group_id=eq.${selectedGroup}` }, () => loadBalances(selectedGroup))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_splits', filter: `group_id=eq.${selectedGroup}` }, () => loadBalances(selectedGroup))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: `group_id=eq.${selectedGroup}` }, () => loadBalances(selectedGroup))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedGroup]);

  async function loadGroups() {
    const { data: memberRows } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user!.id)
      .eq('status', 'active');
    const ids = (memberRows ?? []).map((r) => r.group_id);
    if (!ids.length) return;

    const { data } = await supabase.from('groups').select('*').in('id', ids).eq('status', 'active');
    const gs = (data ?? []) as Group[];
    setGroups(gs);
    if (gs.length) {
      setSelectedGroup(gs[0].id);
      setCurrency(gs[0].currency);
    }
  }

  async function loadBalances(groupId: string) {
    setLoading(true);
    const g = groups.find((g) => g.id === groupId);
    if (g) setCurrency(g.currency);

    // Get all members
    const { data: memberData } = await supabase
      .from('group_members')
      .select('user_id, profile:profiles(*)')
      .eq('group_id', groupId)
      .eq('status', 'active');

    // Get all expenses paid by each member
    const { data: expenses } = await supabase
      .from('expenses')
      .select('id, amount_minor, paid_by')
      .eq('group_id', groupId)
      .eq('status', 'active');

    // Get all splits
    const expenseIds = (expenses ?? []).map((e) => e.id);
    let splits: { expense_id: string; user_id: string; share_minor: number }[] = [];
    if (expenseIds.length > 0) {
      const { data: splitData } = await supabase
        .from('expense_splits')
        .select('expense_id, user_id, share_minor')
        .in('expense_id', expenseIds);
      splits = (splitData ?? []) as typeof splits;
    }

    // Get confirmed settlements
    const { data: settlements } = await supabase
      .from('settlements')
      .select('from_user_id, to_user_id, amount_minor')
      .eq('group_id', groupId)
      .eq('status', 'confirmed');

    const memberBalances: MemberBalance[] = (memberData ?? []).map((m: any) => {
      const userId = m.user_id;
      const totalPaid = (expenses ?? [])
        .filter((e) => e.paid_by === userId)
        .reduce((sum, e) => sum + e.amount_minor, 0);
      const totalShare = splits
        .filter((s) => s.user_id === userId)
        .reduce((sum, s) => sum + s.share_minor, 0);
      const confirmedReceived = (settlements ?? [])
        .filter((s: any) => s.to_user_id === userId)
        .reduce((sum: number, s: any) => sum + s.amount_minor, 0);
      const confirmedPaid = (settlements ?? [])
        .filter((s: any) => s.from_user_id === userId)
        .reduce((sum: number, s: any) => sum + s.amount_minor, 0);
      const netBalance = totalPaid - totalShare + confirmedReceived - confirmedPaid;

      return {
        user_id: userId,
        profile: m.profile as Profile,
        total_paid_minor: totalPaid,
        total_share_minor: totalShare,
        confirmed_received_minor: confirmedReceived,
        confirmed_paid_minor: confirmedPaid,
        net_balance_minor: netBalance,
      };
    });

    setBalances(memberBalances);

    // Compute pairwise debts
    const membersMap = new Map<string, Profile>();
    for (const m of (memberData ?? [])) {
      const prof = (Array.isArray(m.profile) ? m.profile[0] : m.profile) as Profile | undefined;
      membersMap.set(m.user_id, prof || {
        id: m.user_id,
        email: '',
        full_name: 'Member',
        avatar_url: null,
        phone: null,
        preferred_currency: 'INR',
        created_at: '',
        updated_at: '',
      });
    }

    const { allDebts: debts, userBalance: balance } = calculateGroupDebts(
      (expenses ?? []).map((e) => ({ ...e, status: 'active' })),
      splits,
      (settlements ?? []).map((s) => ({ ...s, status: 'confirmed' })),
      membersMap,
      user!.id
    );

    const totalSpent = (expenses ?? []).reduce((sum, e) => sum + e.amount_minor, 0);
    const myPaid = (expenses ?? []).filter((e) => e.paid_by === user!.id).reduce((sum, e) => sum + e.amount_minor, 0);
    setGroupTotalSpent(totalSpent);
    setUserPaidTotal(myPaid);

    setAllDebts(debts);
    setUserBalance(balance);
    setLoading(false);
  }

  function handleSendWhatsAppReminder(debtorName: string, amountMinor: number, phone?: string | null) {
    const groupName = groups.find((g) => g.id === selectedGroup)?.name || 'our group';
    const formattedAmount = formatCurrency(amountMinor, currency);
    const myName = profile?.full_name || user?.user_metadata?.full_name || 'Your group member';

    const message = encodeURIComponent(
      `Hey ${debtorName}! 👋\n\nFriendly reminder regarding our group "${groupName}" on THE SPLIT EXPENSES.\n\n💰 Pending Amount: ${formattedAmount}\n👤 You need to send this amount to: ${myName}\n\nPlease settle up when you get a chance!`
    );

    let cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    }

    const waUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${message}`
      : `https://api.whatsapp.com/send?text=${message}`;

    window.open(waUrl, '_blank');
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Balances</h1>
        <p className="text-sm text-gray-500 mt-0.5">See who owes what across your groups</p>
      </div>

      {/* Group Selector */}
      <div className="max-w-xs">
        <label className="label">Select Group</label>
        <select
          className="input"
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      {/* Group Financial Overview KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="card p-4 flex flex-col gap-1.5 bg-white border-gray-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Group Total Spend</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-gray-900 mt-1">
            {formatCurrency(groupTotalSpent, currency)}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            Active expenses
          </span>
        </div>

        <div className="card p-4 flex flex-col gap-1.5 bg-white border-gray-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">You Paid</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-emerald-700 mt-1">
            {formatCurrency(userPaidTotal, currency)}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            Out-of-pocket
          </span>
        </div>

        <div className="card p-4 flex flex-col gap-1.5 bg-white border-red-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">You Owe</span>
            <div className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-red-600 mt-1">
            {formatCurrency(userBalance.total_give_minor, currency)}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            {userBalance.give_to.length} pending debt{userBalance.give_to.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="card p-4 flex flex-col gap-1.5 bg-white border-emerald-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Owed to You</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-emerald-700 mt-1">
            {formatCurrency(userBalance.total_take_minor, currency)}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            {userBalance.take_from.length} incoming debt{userBalance.take_from.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Give & Take Money Financial Standing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* GIVE MONEY (You Owe) */}
        <div className="card border-red-200/70 bg-gradient-to-br from-red-50/50 via-white to-red-50/20 p-5 space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-red-600 uppercase tracking-wider block">
                  Give Money (You Owe)
                </span>
                <p className="text-xs text-gray-500">Total you need to give</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-red-600">
                {formatCurrency(userBalance.total_give_minor, currency)}
              </span>
            </div>
          </div>

          {userBalance.give_to.length > 0 ? (
            <div className="pt-2.5 border-t border-red-100 space-y-2">
              <p className="text-xs font-semibold text-gray-700">You need to give to:</p>
              <div className="space-y-2">
                {userBalance.give_to.map((item) => (
                  <div
                    key={item.user_id}
                    className="flex items-center justify-between bg-white p-3 rounded-xl border border-red-100 shadow-xs text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {getInitials(item.profile?.full_name)}
                      </div>
                      <span className="font-semibold text-gray-900 truncate">
                        {item.profile?.full_name || 'Member'}
                      </span>
                    </div>
                    <span className="font-extrabold text-sm text-red-600">
                      {formatCurrency(item.amount_minor, currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="pt-2.5 border-t border-red-100/60 text-xs text-gray-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>You don't owe money to anyone in this group!</span>
            </div>
          )}
        </div>

        {/* TAKE MONEY (You are Owed) */}
        <div className="card border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-emerald-50/20 p-5 space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider block">
                  Take Money (You are Owed)
                </span>
                <p className="text-xs text-gray-500">Total you will receive</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-emerald-700">
                {formatCurrency(userBalance.total_take_minor, currency)}
              </span>
            </div>
          </div>

          {userBalance.take_from.length > 0 ? (
            <div className="pt-2.5 border-t border-emerald-100 space-y-2">
              <p className="text-xs font-semibold text-gray-700">You will get money from:</p>
              <div className="space-y-2">
                {userBalance.take_from.map((item) => (
                  <div
                    key={item.user_id}
                    className="flex items-center justify-between bg-white p-3 rounded-xl border border-emerald-100 shadow-xs text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {getInitials(item.profile?.full_name)}
                      </div>
                      <span className="font-semibold text-gray-900 truncate">
                        {item.profile?.full_name || 'Member'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-extrabold text-sm text-emerald-700">
                        {formatCurrency(item.amount_minor, currency)}
                      </span>
                      <button
                        onClick={() => handleSendWhatsAppReminder(item.profile?.full_name || 'Member', item.amount_minor, item.profile?.phone)}
                        className="btn-secondary text-[11px] py-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1 font-semibold shadow-xs border-transparent transition-colors"
                        title="Send WhatsApp payment reminder"
                      >
                        <Share2 className="w-3 h-3" />
                        Remind on WhatsApp
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="pt-2.5 border-t border-emerald-100/60 text-xs text-gray-500 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span>No one owes you money in this group.</span>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-28 animate-pulse" />
          ))}
        </div>
      ) : balances.length === 0 ? (
        <div className="card text-center py-12">
          <Wallet className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No balance data available. Add expenses to see balances.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {balances.map((b) => (
            <div key={b.user_id} className="card space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700 flex-shrink-0">
                  {getInitials(b.profile?.full_name)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{b.profile?.full_name ?? 'Unknown'}</p>
                  <p className="text-xs text-gray-500">{b.profile?.email}</p>
                </div>
                <div className="ml-auto">
                  {b.net_balance_minor === 0 ? (
                    <span className="badge-gray">Settled</span>
                  ) : b.net_balance_minor > 0 ? (
                    <span className="badge-green">Gets back {formatCurrency(b.net_balance_minor, currency)}</span>
                  ) : (
                    <span className="badge-red">Owes {formatCurrency(Math.abs(b.net_balance_minor), currency)}</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-gray-500">Total Paid</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{formatCurrency(b.total_paid_minor, currency)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-gray-500">Total Share</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{formatCurrency(b.total_share_minor, currency)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

