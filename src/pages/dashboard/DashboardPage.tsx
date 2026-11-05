import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Receipt, Wallet, TrendingUp, TrendingDown,
  PlusCircle, Clock, ArrowRight, Bell, UserPlus, CheckCircle2, XCircle, Loader2, Scale,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import { formatCurrency, relativeTime, groupTypeEmoji } from '@/utils';
import { calculateGroupDebts } from '@/utils/debts';
import type { Group, Expense, Profile } from '@/types';

interface DashboardStats {
  totalGroups: number;
  totalExpenses: number;
  amountPaid: number;
  amountOwed: number;
  amountOwedToYou: number;
  netBalance: number;
}

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalGroups: 0,
    totalExpenses: 0,
    amountPaid: 0,
    amountOwed: 0,
    amountOwedToYou: 0,
    netBalance: 0,
  });
  const [groups, setGroups] = useState<Group[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingConfirmations, setPendingConfirmations] = useState<any[]>([]);
  const [processingSettlementId, setProcessingSettlementId] = useState<string | null>(null);
  const [confirmSuccessMsg, setConfirmSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadDashboard();

    // Live realtime channel for instantaneous KPI updates
    const channel = supabase
      .channel('dashboard_realtime_feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_splits' }, () => loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' }, () => loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, () => loadDashboard())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  async function loadDashboard() {
    setLoading(true);
    try {
      // Pending settlement confirmations where current user is recipient
      const { data: pendingSets } = await supabase
        .from('settlements')
        .select('*, from_user:profiles!settlements_from_user_id_fkey(full_name, email), group:groups(id, name, currency)')
        .eq('to_user_id', user!.id)
        .eq('status', 'payment_reported')
        .order('created_at', { ascending: false });

      setPendingConfirmations(pendingSets ?? []);

      // Groups the user belongs to
      const { data: memberRows } = await supabase
        .from('group_members')
        .select('group_id, role')
        .eq('user_id', user!.id)
        .eq('status', 'active');

      const groupIds = (memberRows ?? []).map((r) => r.group_id);

      if (groupIds.length > 0) {
        const [
          { data: groupData },
          { data: allExpenses },
          { data: allSplits },
          { data: allSettlements },
          { data: allMembers },
        ] = await Promise.all([
          supabase.from('groups').select('*').in('id', groupIds).eq('status', 'active').order('created_at', { ascending: false }),
          supabase.from('expenses').select('*, paid_by_profile:profiles!expenses_paid_by_fkey(id,full_name,email,avatar_url)').in('group_id', groupIds).eq('status', 'active').order('expense_date', { ascending: false }),
          supabase.from('expense_splits').select('expense_id, group_id, user_id, share_minor').in('group_id', groupIds),
          supabase.from('settlements').select('group_id, from_user_id, to_user_id, amount_minor, status').in('group_id', groupIds).eq('status', 'confirmed'),
          supabase.from('group_members').select('group_id, user_id, profile:profiles(*)').in('group_id', groupIds).eq('status', 'active'),
        ]);

        const validGroups = (groupData ?? []) as Group[];
        setGroups(validGroups);

        const expList = (allExpenses ?? []) as Expense[];
        setRecentExpenses(expList.slice(0, 5));

        // Total paid across all groups by this user
        const totalPaid = expList
          .filter((e) => e.paid_by === user!.id)
          .reduce((sum, e) => sum + e.amount_minor, 0);

        // Compute accurate pairwise debts across each group
        let totalGiveAcrossAll = 0;
        let totalTakeAcrossAll = 0;

        for (const gid of groupIds) {
          const gExpenses = expList.filter((e) => e.group_id === gid);
          const gSplits = (allSplits ?? []).filter((s) => s.group_id === gid);
          const gSettlements = (allSettlements ?? []).filter((s) => s.group_id === gid);
          const gMembers = (allMembers ?? []).filter((m) => m.group_id === gid);

          const membersMap = new Map<string, Profile>();
          for (const m of gMembers) {
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

          const { userBalance } = calculateGroupDebts(
            gExpenses,
            gSplits,
            gSettlements,
            membersMap,
            user!.id
          );

          totalGiveAcrossAll += userBalance.total_give_minor;
          totalTakeAcrossAll += userBalance.total_take_minor;
        }

        setStats({
          totalGroups: groupIds.length,
          totalExpenses: expList.length,
          amountPaid: totalPaid,
          amountOwed: totalGiveAcrossAll,
          amountOwedToYou: totalTakeAcrossAll,
          netBalance: totalTakeAcrossAll - totalGiveAcrossAll,
        });
      } else {
        setGroups([]);
        setRecentExpenses([]);
        setStats({
          totalGroups: 0,
          totalExpenses: 0,
          amountPaid: 0,
          amountOwed: 0,
          amountOwedToYou: 0,
          netBalance: 0,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmSettlement(settlementId: string) {
    setProcessingSettlementId(settlementId);
    setConfirmSuccessMsg(null);
    try {
      const { data, error } = await supabase.rpc('confirm_settlement_payment', {
        p_settlement_id: settlementId,
      });

      if (error || data?.error) {
        await supabase
          .from('settlements')
          .update({
            status: 'confirmed',
            confirmed_by: user!.id,
            confirmed_at: new Date().toISOString(),
          })
          .eq('id', settlementId);
      }

      setConfirmSuccessMsg('Payment confirmed! Debt has been officially settled.');
      setTimeout(() => setConfirmSuccessMsg(null), 4000);
      loadDashboard();
    } catch (err) {
      console.error('Error confirming settlement:', err);
    } finally {
      setProcessingSettlementId(null);
    }
  }

  async function handleRejectSettlement(settlementId: string) {
    if (!window.confirm('Are you sure you want to mark this payment as not received?')) return;
    setProcessingSettlementId(settlementId);
    try {
      const { data, error } = await supabase.rpc('reject_settlement_payment', {
        p_settlement_id: settlementId,
      });

      if (error || data?.error) {
        await supabase
          .from('settlements')
          .update({ status: 'rejected' })
          .eq('id', settlementId);
      }

      loadDashboard();
    } catch (err) {
      console.error('Error rejecting settlement:', err);
    } finally {
      setProcessingSettlementId(null);
    }
  }

  const statCards = [
    { label: 'My Groups',       value: stats.totalGroups,         icon: Users,         color: 'emerald', isCount: true },
    { label: 'Total Expenses',  value: stats.totalExpenses,       icon: Receipt,       color: 'blue',    isCount: true },
    { label: 'You Paid',        value: stats.amountPaid,          icon: TrendingUp,    color: 'emerald', isCount: false },
    { label: 'You Owe',         value: stats.amountOwed,          icon: TrendingDown,  color: 'red',     isCount: false },
    { label: 'Owed to You',     value: stats.amountOwedToYou,     icon: Wallet,        color: 'green',   isCount: false },
    {
      label: 'Net Balance',
      value: stats.netBalance,
      icon: Scale,
      color: stats.netBalance > 0 ? 'green' : stats.netBalance < 0 ? 'red' : 'emerald',
      isCount: false,
      isNet: true,
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome, {profile?.full_name?.split(' ')[0] ?? 'there'} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Here's your financial overview</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/join" className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-3 text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100">
            <UserPlus className="w-4 h-4 text-emerald-600" /> Join Group
          </Link>
          <Link to="/groups/new" className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3">
            <PlusCircle className="w-4 h-4" /> New Group
          </Link>
          <Link to="/expenses/new" className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-3">
            <PlusCircle className="w-4 h-4" /> Add Expense
          </Link>
        </div>
      </div>

      {/* Success banner if payment confirmed */}
      {confirmSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{confirmSuccessMsg}</span>
        </div>
      )}

      {/* ACTION REQUIRED: Pending Payment Confirmation Prompt */}
      {pendingConfirmations.length > 0 && (
        <div className="space-y-3">
          {pendingConfirmations.map((settlement) => (
            <div
              key={settlement.id}
              className="p-5 bg-gradient-to-r from-amber-50 via-yellow-50/70 to-amber-50 border-2 border-amber-300 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xl flex-shrink-0 shadow-xs">
                  💰
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-extrabold px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full uppercase tracking-wider">
                      Action Required: Confirm Settlement
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {relativeTime(settlement.created_at)}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-gray-900 mt-1">
                    {settlement.from_user?.full_name || 'A group member'} reported paying you{' '}
                    <span className="text-emerald-700 text-base font-extrabold">
                      {formatCurrency(settlement.amount_minor, settlement.group?.currency || 'INR')}
                    </span>
                    {settlement.group?.name ? ` in group "${settlement.group.name}"` : ''}
                    {settlement.payment_method ? ` via ${settlement.payment_method}` : ''}
                  </h4>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {settlement.transaction_reference ? (
                      <span className="font-medium text-gray-800 bg-white/80 px-1.5 py-0.5 rounded border border-amber-200 mr-1.5 font-mono">
                        Ref: {settlement.transaction_reference}
                      </span>
                    ) : null}
                    Did this person settle this amount with you? Click <strong>"Yes, Confirm Settled"</strong> to officially clear the balance.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 sm:self-center flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-amber-200">
                <button
                  onClick={() => handleConfirmSettlement(settlement.id)}
                  disabled={processingSettlementId === settlement.id}
                  className="btn-primary text-xs py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
                >
                  {processingSettlementId === settlement.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Yes, Confirm Settled
                </button>
                <button
                  onClick={() => handleRejectSettlement(settlement.id)}
                  disabled={processingSettlementId === settlement.id}
                  className="btn-secondary text-xs py-2 px-3 border-gray-300 text-red-600 hover:bg-red-50 flex items-center gap-1"
                >
                  <XCircle className="w-4 h-4" />
                  Not Received
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {statCards.map(({ label, value, icon: Icon, color, isCount, isNet }: any) => (
            <div key={label} className="card flex flex-col gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                color === 'red' ? 'bg-red-50' : color === 'blue' ? 'bg-blue-50' : 'bg-emerald-50'
              }`}>
                <Icon className={`w-5 h-5 ${
                  color === 'red' ? 'text-red-500' : color === 'blue' ? 'text-blue-500' : 'text-emerald-600'
                }`} />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
                <p className={`text-xl font-bold mt-0.5 ${
                  color === 'red' ? 'text-red-600' : color === 'green' ? 'text-emerald-600' : 'text-gray-900'
                }`}>
                  {isCount
                    ? value
                    : isNet
                    ? value > 0
                      ? `+${formatCurrency(value)}`
                      : value < 0
                      ? `-${formatCurrency(Math.abs(value))}`
                      : '₹0.00'
                    : formatCurrency(value as number)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Groups + Recent Expenses */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* My Groups */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">My Groups</h2>
            <Link to="/groups" className="text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No groups yet</p>
              <Link to="/groups/new" className="mt-3 inline-block text-sm text-emerald-600 font-medium">
                Create your first group →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {groups.slice(0, 5).map((group) => (
                <Link
                  key={group.id}
                  to={`/groups/${group.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-lg flex-shrink-0">
                    {groupTypeEmoji(group.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{group.name}</p>
                    <p className="text-xs text-gray-500 capitalize">{group.type} · {group.currency}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Expenses */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Expenses</h2>
            <Link to="/expenses" className="text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : recentExpenses.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No expenses yet</p>
              <Link to="/expenses/new" className="mt-3 inline-block text-sm text-emerald-600 font-medium">
                Add first expense →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentExpenses.map((expense) => (
                <div key={expense.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Receipt className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{expense.title}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {relativeTime(expense.created_at)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 flex-shrink-0">
                    {formatCurrency(expense.amount_minor, expense.currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

