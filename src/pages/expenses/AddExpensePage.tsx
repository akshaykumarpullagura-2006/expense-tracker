import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, ArrowLeft, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import { toMinor, splitEqually } from '@/utils';
import type { Group, GroupMember } from '@/types';

const CATEGORIES = [
  'Food','Travel','Accommodation','Transport','Tickets',
  'Shopping','Entertainment','Groceries','Medical','Utilities','Fuel','Other',
];

const schema = z.object({
  title: z.string().min(1, 'Title is required').max(120),
  amount: z.number().positive('Amount must be positive'),
  category: z.string().min(1, 'Select a category'),
  paid_by: z.string().min(1, 'Select who paid'),
  split_type: z.enum(['equal', 'selected']),
  split_members: z.array(z.string()).min(1, 'Select at least one member'),
  expense_date: z.string().min(1, 'Select a date'),
  description: z.string().max(500).optional(),
});
type FormValues = z.infer<typeof schema>;

export default function AddExpensePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedGroup = searchParams.get('group');

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>(preselectedGroup ?? '');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [currency, setCurrency] = useState('INR');
  const [serverError, setServerError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ userId: string; name: string; share: number }[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      split_type: 'equal',
      split_members: [],
      expense_date: new Date().toISOString().slice(0, 10),
    },
  });

  const watchAmount = watch('amount');
  const watchSplitType = watch('split_type');
  const watchSplitMembers = watch('split_members');

  useEffect(() => {
    loadGroups();
  }, [user]);

  useEffect(() => {
    if (selectedGroup) loadMembers(selectedGroup);
  }, [selectedGroup]);

  useEffect(() => {
    calcPreview();
  }, [watchAmount, watchSplitMembers, members]);

  async function loadGroups() {
    if (!user) return;
    const { data: memberRows } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id)
      .eq('status', 'active');
    const ids = (memberRows ?? []).map((r) => r.group_id);
    if (!ids.length) return;

    const { data } = await supabase.from('groups').select('*').in('id', ids).eq('status', 'active');
    setGroups((data ?? []) as Group[]);

    if (!selectedGroup && data?.length) {
      setSelectedGroup(data[0].id);
      setCurrency(data[0].currency);
    } else if (selectedGroup && data) {
      const g = data.find((g) => g.id === selectedGroup);
      if (g) setCurrency(g.currency);
    }
  }

  async function loadMembers(groupId: string) {
    const { data } = await supabase
      .from('group_members')
      .select('*, profile:profiles(*)')
      .eq('group_id', groupId)
      .eq('status', 'active');
    const mems = (data ?? []) as GroupMember[];
    setMembers(mems);
    // Default: select all
    setValue('split_members', mems.map((m) => m.user_id));
    // Default paid_by: current user
    setValue('paid_by', user!.id);
  }

  function calcPreview() {
    if (!watchSplitMembers?.length || !watchAmount) {
      setPreview([]);
      return;
    }
    const totalMinor = toMinor(watchAmount);
    const shares = splitEqually(totalMinor, watchSplitMembers.length);
    const result = watchSplitMembers.map((userId, i) => {
      const member = members.find((m) => m.user_id === userId);
      return {
        userId,
        name: member?.profile?.full_name ?? 'Unknown',
        share: shares[i],
      };
    });
    setPreview(result);
  }

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    if (!selectedGroup || !user) return;

    const totalMinor = toMinor(values.amount);
    const shares = splitEqually(totalMinor, values.split_members.length);

    // Insert expense
    const { data: expense, error: expErr } = await supabase
      .from('expenses')
      .insert({
        group_id: selectedGroup,
        title: values.title,
        amount_minor: totalMinor,
        currency,
        category_id: null,
        paid_by: values.paid_by,
        created_by: user.id,
        split_type: values.split_type,
        expense_date: values.expense_date,
        description: values.description || null,
        status: 'active',
      })
      .select()
      .single();

    if (expErr) { setServerError(expErr.message); return; }

    // Insert splits
    const splitRows = values.split_members.map((userId, i) => ({
      expense_id: expense.id,
      group_id: selectedGroup,
      user_id: userId,
      share_minor: shares[i],
    }));

    const { error: splitErr } = await supabase.from('expense_splits').insert(splitRows);
    if (splitErr) { setServerError(splitErr.message); return; }

    navigate(`/groups/${selectedGroup}`);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link to="/expenses" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Add Expense</h1>
        <p className="text-sm text-gray-500 mt-1">Record a shared expense for your group</p>
      </div>

      <div className="card space-y-5">
        {serverError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{serverError}</div>
        )}

        {/* Group Selector */}
        <div>
          <label className="label">Group *</label>
          <select
            className="input"
            value={selectedGroup}
            onChange={(e) => {
              setSelectedGroup(e.target.value);
              const g = groups.find((g) => g.id === e.target.value);
              if (g) setCurrency(g.currency);
            }}
          >
            <option value="">Select a group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Title */}
          <div>
            <label className="label">Title *</label>
            <input type="text" placeholder="e.g. Dinner at restaurant" className={`input ${errors.title ? 'border-red-400' : ''}`} {...register('title')} />
            {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
          </div>

          {/* Amount */}
          <div>
            <label className="label">Amount ({currency}) *</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              className={`input ${errors.amount ? 'border-red-400' : ''}`}
              {...register('amount', { valueAsNumber: true })}
            />
            {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
          </div>

          {/* Category */}
          <div>
            <label className="label">Category *</label>
            <select className={`input ${errors.category ? 'border-red-400' : ''}`} {...register('category')}>
              <option value="">Select category</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.category && <p className="mt-1 text-xs text-red-600">{errors.category.message}</p>}
          </div>

          {/* Paid By */}
          <div>
            <label className="label">Paid By *</label>
            <select className={`input ${errors.paid_by ? 'border-red-400' : ''}`} {...register('paid_by')}>
              <option value="">Select who paid</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profile?.full_name ?? m.profile?.email ?? m.user_id}
                  {m.user_id === user?.id ? ' (You)' : ''}
                </option>
              ))}
            </select>
            {errors.paid_by && <p className="mt-1 text-xs text-red-600">{errors.paid_by.message}</p>}
          </div>

          {/* Date */}
          <div>
            <label className="label">Expense Date *</label>
            <input type="date" className="input" {...register('expense_date')} />
          </div>

          {/* Split Type */}
          <div>
            <label className="label">Split Type</label>
            <div className="flex gap-3">
              {(['equal', 'selected'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value={t} {...register('split_type')} className="text-emerald-600" />
                  <span className="text-sm font-medium text-gray-700 capitalize">{t === 'equal' ? 'Equal Split' : 'Selected Members'}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Split With */}
          <div>
            <label className="label">Split With *</label>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {members.map((m) => (
                <Controller
                  key={m.user_id}
                  name="split_members"
                  control={control}
                  render={({ field }) => (
                    <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-emerald-600 rounded"
                        checked={field.value.includes(m.user_id)}
                        onChange={(e) => {
                          if (e.target.checked) field.onChange([...field.value, m.user_id]);
                          else field.onChange(field.value.filter((id: string) => id !== m.user_id));
                        }}
                      />
                      <span className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700 flex-shrink-0">
                        {(m.profile?.full_name ?? '?')[0].toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-800">
                        {m.profile?.full_name ?? m.profile?.email}
                        {m.user_id === user?.id ? ' (You)' : ''}
                      </span>
                    </label>
                  )}
                />
              ))}
            </div>
            {errors.split_members && <p className="mt-1 text-xs text-red-600">{errors.split_members.message}</p>}
          </div>

          {/* Share Preview */}
          {preview.length > 0 && watchAmount > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">Share Preview</p>
              </div>
              <div className="space-y-1.5">
                {preview.map((p) => (
                  <div key={p.userId} className="flex justify-between text-sm">
                    <span className="text-gray-700">{p.name}</span>
                    <span className="font-semibold text-gray-900">
                      {new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(p.share / 100)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="label">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={2} placeholder="Any additional notes…" className="input resize-none" {...register('description')} />
          </div>

          <div className="flex gap-3 pt-2">
            <Link to={selectedGroup ? `/groups/${selectedGroup}` : '/expenses'} className="btn-secondary flex-1 text-center">Cancel</Link>
            <button type="submit" disabled={isSubmitting || !selectedGroup} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Expense
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

