import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, ArrowLeft, Archive, Trash2, Settings, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import type { Group, GroupType } from '@/types';

const GROUP_TYPES: { value: GroupType; label: string; emoji: string }[] = [
  { value: 'trip', label: 'Trip', emoji: '✈️' },
  { value: 'friends', label: 'Friends', emoji: '👫' },
  { value: 'family', label: 'Family', emoji: '👨‍👩‍👧‍👦' },
  { value: 'roommates', label: 'Roommates', emoji: '🏠' },
  { value: 'college', label: 'College', emoji: '🎓' },
  { value: 'office', label: 'Office', emoji: '💼' },
  { value: 'event', label: 'Event', emoji: '🎉' },
  { value: 'general', label: 'General', emoji: '📋' },
];

const schema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(300).optional(),
  type: z.enum(['trip','friends','family','roommates','college','office','event','general']),
  currency: z.string().min(1),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function GroupSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });
  const selectedType = watch('type');

  useEffect(() => { if (id) loadGroup(); }, [id]);

  async function loadGroup() {
    setLoading(true);
    const { data: gm } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', id!)
      .eq('user_id', user!.id)
      .single();

    if (gm?.role !== 'admin') { navigate(`/groups/${id}`); return; }

    const { data } = await supabase.from('groups').select('*').eq('id', id!).single();
    if (!data) { navigate('/groups'); return; }
    const g = data as Group;
    setGroup(g);
    setValue('name', g.name);
    setValue('description', g.description ?? '');
    setValue('type', g.type);
    setValue('currency', g.currency);
    setValue('start_date', g.start_date ?? '');
    setValue('end_date', g.end_date ?? '');
    setLoading(false);
  }

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    setServerError(null);
    const { error } = await supabase.from('groups').update({
      name: values.name,
      description: values.description || null,
      type: values.type,
      currency: values.currency,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id!);
    if (error) setServerError(error.message);
    else { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    setSaving(false);
  };

  async function archiveGroup() {
    if (!window.confirm('Archive this group? Members will still be able to view past data.')) return;
    await supabase.from('groups').update({ status: 'archived' }).eq('id', id!);
    navigate('/groups');
  }

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-64">
      <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
    </div>
  );

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <Link to={`/groups/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to Group
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-emerald-600" /> Group Settings
        </h1>
      </div>

      <div className="card">
        {serverError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{serverError}</div>}
        {saved && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">✅ Group settings saved!</div>}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="label">Group Name *</label>
            <input type="text" className={`input ${errors.name ? 'border-red-400' : ''}`} {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div>
            <label className="label">Description</label>
            <textarea rows={2} className="input resize-none" {...register('description')} />
          </div>
          <div>
            <label className="label">Group Type *</label>
            <div className="grid grid-cols-4 gap-2">
              {GROUP_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => setValue('type', t.value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                    selectedType === t.value ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}>
                  <span className="text-xl">{t.emoji}</span>
                  <span className="text-xs">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Currency *</label>
            <select className="input" {...register('currency')}>
              {['INR','USD','EUR','GBP','AED','SGD'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input" {...register('start_date')} />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" className="input" {...register('end_date')} />
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="card border-red-200">
        <h3 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Danger Zone
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Archiving the group hides it from the active list but preserves all data. This action can be reversed.
        </p>
        <button
          onClick={archiveGroup}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium transition-colors"
        >
          <Archive className="w-4 h-4" /> Archive Group
        </button>
      </div>
    </div>
  );
}

