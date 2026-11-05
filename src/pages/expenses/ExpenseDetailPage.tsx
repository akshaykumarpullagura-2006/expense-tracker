import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Trash2, Receipt, Calendar,
  Users, CreditCard, User, Loader2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import { formatCurrency, formatDate, getInitials } from '@/utils';
import type { Expense, ExpenseSplit, Profile } from '@/types';

interface FullExpense extends Expense {
  paid_by_profile: Profile;
  created_by_profile: Profile;
  splits: (ExpenseSplit & { profile: Profile })[];
  group: { name: string; currency: string };
}

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [expense, setExpense] = useState<FullExpense | null>(null);
  const [loading, setLoading] = useState(true);
  const [reversing, setReversing] = useState(false);
  const [myRole, setMyRole] = useState<'admin' | 'member' | null>(null);

  useEffect(() => {
    if (!id) return;
    loadExpense();
  }, [id]);

  async function loadExpense() {
    setLoading(true);
    const { data: exp } = await supabase
      .from('expenses')
      .select(`
        *,
        paid_by_profile:profiles!expenses_paid_by_fkey(*),
        created_by_profile:profiles!expenses_created_by_fkey(*),
        group:groups(name, currency)
      `)
      .eq('id', id!)
      .single();

    if (!exp) { navigate('/expenses'); return; }

    const { data: splits } = await supabase
      .from('expense_splits')
      .select('*, profile:profiles(*)')
      .eq('expense_id', id!);

    const { data: gm } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', exp.group_id)
      .eq('user_id', user!.id)
      .single();

    setMyRole((gm?.role as 'admin' | 'member') ?? null);
    setExpense({ ...exp, splits: splits ?? [] } as FullExpense);
    setLoading(false);
  }

  async function reverseExpense() {
    if (!expense) return;
    if (!window.confirm('Are you sure you want to reverse this expense? This cannot be undone.')) return;
    setReversing(true);
    await supabase.from('expenses').update({ status: 'reversed', updated_at: new Date().toISOString() }).eq('id', expense.id);
    navigate(`/groups/${expense.group_id}`);
  }

  const canEdit = expense && (expense.created_by === user?.id || myRole === 'admin');

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-64">
      <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
    </div>
  );

  if (!expense) return null;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <Link to="/expenses" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft className="w-4 h-4" /> All Expenses
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{expense.title}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{(expense.group as any)?.name}</p>
          </div>
          {canEdit && expense.status === 'active' && (
            <div className="flex gap-2 flex-shrink-0">
              <Link
                to={`/expenses/${expense.id}/edit`}
                className="btn-secondary flex items-center gap-1.5 text-sm py-1.5 px-3"
              >
                <Edit2 className="w-4 h-4" /> Edit
              </Link>
              <button
                onClick={reverseExpense}
                disabled={reversing}
                className="flex items-center gap-1.5 text-sm py-1.5 px-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {reversing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Reverse
              </button>
            </div>
          )}
        </div>
      </div>

      {expense.status === 'reversed' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
          ⚠️ This expense has been reversed and is no longer active.
        </div>
      )}

      {/* Summary Card */}
      <div className="card bg-emerald-50 border-emerald-200">
        <div className="text-center">
          <p className="text-sm text-emerald-700 font-medium">Total Amount</p>
          <p className="text-4xl font-bold text-emerald-800 mt-1">
            {formatCurrency(expense.amount_minor, expense.currency)}
          </p>
          <span className={`mt-2 inline-block text-xs px-3 py-1 rounded-full font-semibold ${
            expense.status === 'active' ? 'bg-emerald-200 text-emerald-800' : 'bg-red-200 text-red-800'
          }`}>
            {expense.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-900">Expense Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-start gap-2">
            <CreditCard className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Paid By</p>
              <p className="text-sm font-medium text-gray-900">{expense.paid_by_profile?.full_name ?? 'Unknown'}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <User className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Added By</p>
              <p className="text-sm font-medium text-gray-900">{expense.created_by_profile?.full_name ?? 'Unknown'}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Date</p>
              <p className="text-sm font-medium text-gray-900">{formatDate(expense.expense_date)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Receipt className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Split Type</p>
              <p className="text-sm font-medium text-gray-900 capitalize">{expense.split_type} Split</p>
            </div>
          </div>
        </div>
        {expense.description && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Notes</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{expense.description}</p>
          </div>
        )}
      </div>

      {/* Splits */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-600" />
          Split Breakdown ({expense.splits?.length ?? 0} members)
        </h3>
        {expense.splits?.length === 0 ? (
          <p className="text-sm text-gray-400">No split data recorded</p>
        ) : (
          <div className="space-y-2">
            {expense.splits?.map((split) => (
              <div key={split.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700 flex-shrink-0">
                  {getInitials(split.profile?.full_name)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{split.profile?.full_name ?? 'Unknown'}</p>
                  {split.user_id === expense.paid_by && (
                    <p className="text-xs text-emerald-600 font-medium">Paid the bill</p>
                  )}
                </div>
                <p className="text-sm font-semibold text-gray-900">
                  {formatCurrency(split.share_minor, expense.currency)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

