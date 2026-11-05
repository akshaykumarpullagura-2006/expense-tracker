import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Receipt, Search, TrendingUp, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import { formatCurrency, relativeTime } from '@/utils';
import type { Expense } from '@/types';

export default function ExpensesPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    loadExpenses();

    // Live realtime channel for instantaneous expenses updates
    const channel = supabase
      .channel('all_expenses_feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => loadExpenses())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  async function loadExpenses() {
    setLoading(true);
    const { data: memberRows } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user!.id)
      .eq('status', 'active');
    const ids = (memberRows ?? []).map((r) => r.group_id);
    if (!ids.length) { setLoading(false); return; }

    const { data } = await supabase
      .from('expenses')
      .select('*, paid_by_profile:profiles!expenses_paid_by_fkey(id,full_name,email), group:groups(name,currency)')
      .in('group_id', ids)
      .eq('status', 'active')
      .order('expense_date', { ascending: false });

    setExpenses((data ?? []) as Expense[]);
    setLoading(false);
  }

  const filtered = expenses.filter((e) =>
    e.title.toLowerCase().includes(search.toLowerCase())
  );

  const totalSpent = expenses.reduce((s, e) => s + e.amount_minor, 0);
  const myPaid = expenses.filter((e) => e.paid_by === user?.id).reduce((s, e) => s + e.amount_minor, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">{expenses.length} expense{expenses.length !== 1 ? 's' : ''} across all your groups</p>
        </div>
        <Link to="/expenses/new" className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
          <Plus className="w-4 h-4" /> Add Expense
        </Link>
      </div>

      {/* Expenses Overview KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="card p-4 flex flex-col gap-1.5 bg-white border-gray-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Group Spend</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-gray-900 mt-1">
            {formatCurrency(totalSpent)}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            Across {expenses.length} total transaction{expenses.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="card p-4 flex flex-col gap-1.5 bg-white border-gray-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Paid by You</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-emerald-700 mt-1">
            {formatCurrency(myPaid)}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            Paid out of your pocket
          </span>
        </div>

        <div className="card p-4 flex flex-col gap-1.5 bg-white border-gray-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Transactions</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-purple-700 mt-1">
            {expenses.length}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            Active group expense entries
          </span>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search expenses…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-9 text-sm"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card h-16 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 card">
          <Receipt className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600 mb-1">No expenses yet</p>
          <Link to="/expenses/new" className="mt-3 inline-block text-sm text-emerald-600 font-medium">Add your first expense →</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((expense) => (
            <Link
              key={expense.id}
              to={`/expenses/${expense.id}`}
              className="card flex items-center gap-4 hover:shadow-elevated transition-shadow"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Receipt className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{expense.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {(expense as any).group?.name} · Paid by {(expense as any).paid_by_profile?.full_name ?? 'Unknown'} · {relativeTime(expense.created_at)}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-semibold text-gray-900">{formatCurrency(expense.amount_minor, expense.currency)}</p>
                <p className="text-xs text-gray-400 capitalize">{expense.split_type} split</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

