import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import type { GroupType } from '@/types';

const GROUP_TYPES: { value: GroupType; label: string; emoji: string }[] = [
  { value: 'trip',       label: 'Trip',       emoji: '✈️' },
  { value: 'friends',    label: 'Friends',    emoji: '👫' },
  { value: 'family',     label: 'Family',     emoji: '👨‍👩‍👧‍👦' },
  { value: 'roommates',  label: 'Roommates',  emoji: '🏠' },
  { value: 'college',    label: 'College',    emoji: '🎓' },
  { value: 'office',     label: 'Office',     emoji: '💼' },
  { value: 'event',      label: 'Event',      emoji: '🎉' },
  { value: 'general',    label: 'General',    emoji: '📋' },
];

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];

const schema = z.object({
  name: z.string().min(2, 'Group name must be at least 2 characters').max(80, 'Too long'),
  description: z.string().max(300, 'Description too long').optional(),
  type: z.enum(['trip','friends','family','roommates','college','office','event','general']),
  currency: z.string().min(1),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function generateInviteCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function CreateGroupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'general', currency: 'INR' },
  });

  const selectedType = watch('type');

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    if (!user) return;

    // Create group
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert({
        name: values.name,
        description: values.description || null,
        type: values.type,
        currency: values.currency,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
        created_by: user.id,
        invite_code: generateInviteCode(),
        status: 'active',
      })
      .select()
      .single();

    if (groupError) {
      setServerError(groupError.message);
      return;
    }

    // Add creator as admin member
    const { error: memberError } = await supabase
      .from('group_members')
      .insert({
        group_id: group.id,
        user_id: user.id,
        role: 'admin',
        status: 'active',
      });

    if (memberError) {
      setServerError(memberError.message);
      return;
    }

    navigate(`/groups/${group.id}`);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link to="/groups" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Groups
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Create a New Group</h1>
        <p className="text-sm text-gray-500 mt-1">Set up a group to start splitting expenses</p>
      </div>

      <div className="card">
        {serverError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{serverError}</div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Name */}
          <div>
            <label className="label">Group Name *</label>
            <input
              type="text"
              placeholder="e.g. Goa Trip 2025"
              className={`input ${errors.name ? 'border-red-400' : ''}`}
              {...register('name')}
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              rows={2}
              placeholder="What is this group for?"
              className={`input resize-none ${errors.description ? 'border-red-400' : ''}`}
              {...register('description')}
            />
            {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
          </div>

          {/* Type */}
          <div>
            <label className="label">Group Type *</label>
            <div className="grid grid-cols-4 gap-2">
              {GROUP_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setValue('type', t.value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                    selectedType === t.value
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  <span className="text-xl">{t.emoji}</span>
                  <span className="text-xs">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Currency */}
          <div>
            <label className="label">Currency *</label>
            <select className="input" {...register('currency')}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="date" className="input" {...register('start_date')} />
            </div>
            <div>
              <label className="label">End Date <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="date" className="input" {...register('end_date')} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Link to="/groups" className="btn-secondary flex-1 text-center">Cancel</Link>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Group
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

