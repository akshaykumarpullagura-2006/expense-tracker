import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, ArrowLeft, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import { toMinor, splitEqually } from '@/utils';
import type { GroupMember } from '@/types';

const CATEGORIES = [
  'Food','Travel','Accommodation','Transport','Tickets',
  'Shopping','Entertainment','Groceries','Medical','Utilities','Fuel','Other',
];

const schema = z.object({
  title: z.string().min(1, 'Title is required').max(120),
  amount: z.number().positive(),
  category: z.string().min(1),
  paid_by: z.string().min(1),
  split_type: z.enum(['equal', 'selected']),
  split_members: z.array(z.string()).min(1),
  expense_date: z.string().min(1),
  description: z.string().max(500).optional(),
});
type FormValues = z.infer<typeof schema>;

export default function EditExpensePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [currency, setCurrency] = useState('INR');
  const [groupId, setGroupId] = useState('');
  const [preview, setPreview] = useState<{ userId: string; name: string; share: number }[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    register, handleSubmit, watch, control, setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const watchAmount = watch('amount');
  const watchSplitMembers = watch('split_members');

  useEffect(() => { if (id) loadExpense(); }, [id]);
  useEffect(() => { calcPreview(); }, [watchAmount, watchSplitMembers, members]);

  async function loadExpense() {
    setLoading(true);
    const { data: exp } = await supabase.from('expenses').select('*').eq('id', id!).single();
    if (!exp) { navigate('/expenses'); return; }

    // Check permission
    if (exp.created_by !== user!.id) {
      const { data: gm } = await supabase.from('group_members').select('role').eq('group_id', exp.group_id).eq('user_id', user!.id).single();
      if (gm?.role !== 'admin') { navigate(`/expenses/${id}`); return; }
    }

    setGroupId(exp.group_id);

    const { data: gData } = await supabase.from('groups').select('currency').eq('id', exp.group_id).single();
    setCurrency(gData?.currency ?? 'INR');

    const { data: mData } = await supabase
      .from('group_members')
      .select('*, profile:profiles(*)')
      .eq('group_id', exp.group_id)
      .eq('status', 'active');
    setMembers((mData ?? []) as GroupMember[]);

    const { data: splits } = await supabase.from('expense_splits').select('user_id').eq('expense_id', id!);
    const splitUserIds = (splits ?? []).map((s) => s.user_id);

    setValue('title', exp.title);
    setValue('amount', exp.amount_minor / 100);
    setValue('category', exp.category_id ?? 'Other');
    setValue('paid_by', exp.paid_by);
    setValue('split_type', exp.split_type as 'equal' | 'selected');
    setValue('split_members', splitUserIds.length ? splitUserIds : (mData ?? []).map((m: any) => m.user_id));
    setValue('expense_date', exp.expense_date);
    setValue('description', exp.description ?? '');
    setLoading(false);
  }

  function calcPreview() {
    if (!watchSplitMembers?.length || !watchAmount) { setPreview([]); return; }
    const totalMinor = toMinor(watchAmount);
    const shares = splitEqually(totalMinor, watchSplitMembers.length);
    setPreview(watchSplitMembers.map((userId, i) => ({
      userId,
      name: members.find((m) => m.user_id === userId)?.profile?.full_name ?? 'Unknown',
      share: shares[i],
    })));
  }

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const totalMinor = toMinor(values.amount);
    const shares = splitEqually(totalMinor, values.split_members.length);

    const { error: expErr } = await supabase.from('expenses').update({
      title: values.title,
      amount_minor: totalMinor,
      paid_by: values.paid_by,
      split_type: values.split_type,
      expense_date: values.expense_date,
      description: values.description || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id!);

    if (expErr) { setServerError(expErr.message); return; }

    // Delete old splits and re-insert
    await supabase.from('expense_splits').delete().eq('expense_id', id!);
    const splitRows = values.split_members.map((userId, i) => ({
      expense_id: id!,
      group_id: groupId,
      user_id: userId,
      share_minor: shares[i],
    }));
    const { error: splitErr } = await supabase.from('expense_splits').insert(splitRows);
    if (splitErr) { setServerError(splitErr.message); return; }

    navigate(`/expenses/${id}`);
  };

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-64">
      <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
    </div>
  );

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link to={`/expenses/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Expense
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Expense</h1>
      </div>

      <div className="card">
        {serverError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{serverError}</div>}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="label">Title *</label>
            <input type="text" className={`input ${errors.title ? 'border-red-400' : ''}`} {...register('title')} />
            {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
          </div>
          <div>
            <label className="label">Amount ({currency}) *</label>
            <input type="number" step="0.01" className="input" {...register('amount', { valueAsNumber: true })} />
            {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
          </div>
          <div>
            <label className="label">Category *</label>
            <select className="input" {...register('category')}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Paid By *</label>
            <select className="input" {...register('paid_by')}>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profile?.full_name ?? m.profile?.email}
                  {m.user_id === user?.id ? ' (You)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date *</label>
            <input type="date" className="input" {...register('expense_date')} />
          </div>
          <div>
            <label className="label">Split With *</label>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {members.map((m) => (
                <Controller key={m.user_id} name="split_members" control={control} render={({ field }) => (
                  <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded"
                      checked={field.value?.includes(m.user_id)}
                      onChange={(e) => {
                        if (e.target.checked) field.onChange([...(field.value ?? []), m.user_id]);
                        else field.onChange((field.value ?? []).filter((id: string) => id !== m.user_id));
                      }} />
                    <span className="text-sm text-gray-800">{m.profile?.full_name ?? m.profile?.email}{m.user_id === user?.id ? ' (You)' : ''}</span>
                  </label>
                )} />
              ))}
            </div>
          </div>

          {preview.length > 0 && watchAmount > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">Updated Share Preview</p>
              </div>
              <div className="space-y-1.5">
                {preview.map((p) => (
                  <div key={p.userId} className="flex justify-between text-sm">
                    <span className="text-gray-700">{p.name}</span>
                    <span className="font-semibold">{new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(p.share / 100)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="label">Notes</label>
            <textarea rows={2} className="input resize-none" {...register('description')} />
          </div>

          <div className="flex gap-3 pt-2">
            <Link to={`/expenses/${id}`} className="btn-secondary flex-1 text-center">Cancel</Link>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

