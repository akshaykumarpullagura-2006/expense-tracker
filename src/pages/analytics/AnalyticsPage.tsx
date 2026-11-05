import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import { formatCurrency } from '@/utils';
import { Receipt, TrendingUp, Award, CheckCircle2 } from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import type { Group } from '@/types';

const COLORS = ['#059669','#0ea5e9','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316'];

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [categoryData, setCategoryData] = useState<{ name: string; value: number }[]>([]);
  const [memberData, setMemberData] = useState<{ name: string; paid: number; share: number }[]>([]);
  const [currency, setCurrency] = useState('INR');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalSpend: 0,
    expenseCount: 0,
    topSpenderName: '—',
    topSpenderAmount: 0,
    settledTotal: 0,
  });

  useEffect(() => { if (user) loadGroups(); }, [user]);

  useEffect(() => {
    if (!selectedGroup) return;
    loadAnalytics(selectedGroup);

    // Live realtime channel for instantaneous analytics updates
    const channel = supabase
      .channel(`analytics_${selectedGroup}_feed`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `group_id=eq.${selectedGroup}` }, () => loadAnalytics(selectedGroup))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_splits', filter: `group_id=eq.${selectedGroup}` }, () => loadAnalytics(selectedGroup))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: `group_id=eq.${selectedGroup}` }, () => loadAnalytics(selectedGroup))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedGroup]);

  async function loadGroups() {
    const { data: mr } = await supabase.from('group_members').select('group_id').eq('user_id', user!.id).eq('status', 'active');
    const ids = (mr ?? []).map((r) => r.group_id);
    if (!ids.length) return;
    const { data } = await supabase.from('groups').select('*').in('id', ids).eq('status', 'active');
    const gs = (data ?? []) as Group[];
    setGroups(gs);
    if (gs.length) { setSelectedGroup(gs[0].id); setCurrency(gs[0].currency); }
  }

  async function loadAnalytics(groupId: string) {
    setLoading(true);
    const g = groups.find((g) => g.id === groupId);
    if (g) setCurrency(g.currency);

    const [
      { data: expenses },
      { data: members },
      { data: splits },
      { data: settlements },
    ] = await Promise.all([
      supabase.from('expenses').select('amount_minor, paid_by, category_id').eq('group_id', groupId).eq('status', 'active'),
      supabase.from('group_members').select('user_id, profile:profiles(full_name)').eq('group_id', groupId).eq('status', 'active'),
      supabase.from('expense_splits').select('user_id, share_minor').eq('group_id', groupId),
      supabase.from('settlements').select('amount_minor').eq('group_id', groupId).eq('status', 'confirmed'),
    ]);

    const expList = expenses ?? [];
    const totalSpend = expList.reduce((sum, e) => sum + e.amount_minor, 0);
    const settledTotal = (settlements ?? []).reduce((sum, s) => sum + s.amount_minor, 0);

    // Category distribution
    const catMap: Record<string, number> = {};
    expList.forEach((e) => {
      const key = e.category_id || 'General';
      catMap[key] = (catMap[key] ?? 0) + e.amount_minor;
    });
    setCategoryData(Object.entries(catMap).map(([name, value]) => ({ name, value })));

    // Member contributions & top spender
    let topName = '—';
    let topAmount = 0;

    const mData = (members ?? []).map((m: any) => {
      const paid = expList.filter((e) => e.paid_by === m.user_id).reduce((s, e) => s + e.amount_minor, 0);
      const share = (splits ?? []).filter((s) => s.user_id === m.user_id).reduce((sum, s) => sum + s.share_minor, 0);

      if (paid > topAmount) {
        topAmount = paid;
        topName = m.profile?.full_name ?? 'Member';
      }

      return {
        name: m.profile?.full_name?.split(' ')[0] ?? 'Unknown',
        paid: paid / 100,
        share: share / 100,
      };
    });

    setStats({
      totalSpend,
      expenseCount: expList.length,
      topSpenderName: topName,
      topSpenderAmount: topAmount,
      settledTotal,
    });

    setMemberData(mData);
    setLoading(false);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-0.5">Visual breakdown of your group expenses</p>
      </div>

      <div className="max-w-xs">
        <label className="label">Select Group</label>
        <select className="input" value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 flex flex-col gap-1.5 bg-white border-gray-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Group Spend</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-gray-900 mt-1">
            {formatCurrency(stats.totalSpend, currency)}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            Across {stats.expenseCount} expense{stats.expenseCount !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="card p-4 flex flex-col gap-1.5 bg-white border-gray-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Top Spender</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-emerald-700 mt-1 truncate">
            {stats.topSpenderName}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            Paid {formatCurrency(stats.topSpenderAmount, currency)}
          </span>
        </div>

        <div className="card p-4 flex flex-col gap-1.5 bg-white border-gray-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Expense</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-purple-700 mt-1">
            {stats.expenseCount > 0 ? formatCurrency(Math.round(stats.totalSpend / stats.expenseCount), currency) : '₹0.00'}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            Per transaction
          </span>
        </div>

        <div className="card p-4 flex flex-col gap-1.5 bg-white border-gray-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Settled Debts</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-teal-700 mt-1">
            {formatCurrency(stats.settledTotal, currency)}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            Officially confirmed
          </span>
        </div>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="card h-64 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Category Pie */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">Expense by Category</h3>
            {categoryData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-gray-400">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name }) => name}>
                    {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v) || 0, currency)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Member Bar */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">Paid vs Share by Member</h3>
            {memberData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-gray-400">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={memberData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => `${currency} ${(Number(v) || 0).toFixed(2)}`} />
                  <Legend />
                  <Bar dataKey="paid" name="Paid" fill="#059669" radius={[4,4,0,0]} />
                  <Bar dataKey="share" name="Share" fill="#0ea5e9" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

