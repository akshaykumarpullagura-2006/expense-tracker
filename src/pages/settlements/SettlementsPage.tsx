import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import { formatCurrency, getInitials, relativeTime } from '@/utils';
import { Wallet, Plus, Loader2, CheckCircle, XCircle, Clock, CheckCircle2, TrendingUp } from 'lucide-react';
import type { Group, Settlement, Profile } from '@/types';

export default function SettlementsPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState('INR');

  // Record settlement modal state
  const [showModal, setShowModal] = useState(false);
  const [members, setMembers] = useState<{ user_id: string; profile: Profile }[]>([]);
  const [toUserId, setToUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('UPI');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => { if (user) loadGroups(); }, [user]);

  useEffect(() => {
    if (!selectedGroup) return;
    loadSettlements(selectedGroup);

    // Live realtime channel for instantaneous settlements updates
    const channel = supabase
      .channel(`settlements_${selectedGroup}_feed`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: `group_id=eq.${selectedGroup}` }, () => loadSettlements(selectedGroup))
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

  async function loadSettlements(groupId: string) {
    setLoading(true);
    const g = groups.find((g) => g.id === groupId);
    if (g) setCurrency(g.currency);

    const { data } = await supabase
      .from('settlements')
      .select('*, from_user:profiles!settlements_from_user_id_fkey(*), to_user:profiles!settlements_to_user_id_fkey(*)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    setSettlements((data ?? []) as Settlement[]);

    // Load members for modal
    const { data: mData } = await supabase
      .from('group_members')
      .select('user_id, profile:profiles(*)')
      .eq('group_id', groupId)
      .eq('status', 'active')
      .neq('user_id', user!.id);
    setMembers((mData ?? []).map((m: any) => ({ user_id: m.user_id, profile: m.profile as Profile })));
    setLoading(false);
  }

  async function recordSettlement(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroup || !toUserId || !amount) return;
    setSubmitting(true);
    setModalError(null);

    const { error } = await supabase.from('settlements').insert({
      group_id: selectedGroup,
      from_user_id: user!.id,
      to_user_id: toUserId,
      amount_minor: Math.round(parseFloat(amount) * 100),
      currency,
      status: 'payment_reported',
      payment_method: method,
      transaction_reference: reference || null,
      created_by: user!.id,
    });

    if (error) { setModalError(error.message); }
    else { setShowModal(false); setAmount(''); setReference(''); loadSettlements(selectedGroup); }
    setSubmitting(false);
  }

  async function confirmSettlement(id: string) {
    await supabase.from('settlements').update({ status: 'confirmed', confirmed_by: user!.id, confirmed_at: new Date().toISOString() }).eq('id', id);
    loadSettlements(selectedGroup);
  }

  async function rejectSettlement(id: string) {
    await supabase.from('settlements').update({ status: 'rejected' }).eq('id', id);
    loadSettlements(selectedGroup);
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'badge-yellow',
      payment_reported: 'badge-yellow',
      confirmed: 'badge-green',
      rejected: 'badge-red',
      cancelled: 'badge-gray',
    };
    return map[status] ?? 'badge-gray';
  };

  const totalSettled = settlements.filter(s => s.status === 'confirmed').reduce((sum, s) => sum + s.amount_minor, 0);
  const pendingCount = settlements.filter(s => s.status === 'payment_reported').length;
  const mySettledPaid = settlements.filter(s => s.from_user_id === user?.id && s.status === 'confirmed').reduce((sum, s) => sum + s.amount_minor, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settlements</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record and confirm payments between members</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
          <Plus className="w-4 h-4" /> Record Payment
        </button>
      </div>

      <div className="max-w-xs">
        <label className="label">Select Group</label>
        <select className="input" value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {/* Settlements Financial Overview KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="card p-4 flex flex-col gap-1.5 bg-white border-gray-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Confirmed Settled</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-emerald-700 mt-1">
            {formatCurrency(totalSettled, currency)}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            Officially cleared debts
          </span>
        </div>

        <div className="card p-4 flex flex-col gap-1.5 bg-white border-gray-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Awaiting Confirmation</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-amber-700 mt-1">
            {pendingCount}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            Reported payment{pendingCount !== 1 ? 's' : ''} to confirm
          </span>
        </div>

        <div className="card p-4 flex flex-col gap-1.5 bg-white border-gray-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">You Paid & Settled</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-blue-700 mt-1">
            {formatCurrency(mySettledPaid, currency)}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            Paid out and verified
          </span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="card h-16 animate-pulse" />)}</div>
      ) : settlements.length === 0 ? (
        <div className="card text-center py-12">
          <Wallet className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No settlements recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {settlements.map((s) => (
            <div key={s.id} className="card flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold text-red-700">
                    {getInitials((s.from_user as any)?.full_name)}
                  </div>
                  <span className="text-sm font-medium text-gray-700">{(s.from_user as any)?.full_name}</span>
                </div>
                <span className="text-gray-400 text-sm">→</span>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
                    {getInitials((s.to_user as any)?.full_name)}
                  </div>
                  <span className="text-sm font-medium text-gray-700">{(s.to_user as any)?.full_name}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-900">{formatCurrency(s.amount_minor, s.currency)}</span>
                <span className={statusBadge(s.status)}>{s.status.replace('_', ' ')}</span>
                {s.status === 'payment_reported' && s.to_user_id === user?.id && (
                  <div className="flex gap-1">
                    <button onClick={() => confirmSettlement(s.id)} className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600" title="Confirm">
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button onClick={() => rejectSettlement(s.id)} className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600" title="Reject">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-elevated p-6 w-full max-w-sm">
            <h3 className="font-bold text-gray-900 mb-4">Record Payment</h3>
            {modalError && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{modalError}</div>}
            <form onSubmit={recordSettlement} className="space-y-4">
              <div>
                <label className="label">Paid To</label>
                <select className="input" value={toUserId} onChange={(e) => setToUserId(e.target.value)} required>
                  <option value="">Select member</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Amount ({currency})</label>
                <input type="number" step="0.01" placeholder="0.00" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>
              <div>
                <label className="label">Payment Method</label>
                <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {['UPI','Cash','Bank Transfer','Other'].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">UPI/Reference ID <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" placeholder="Transaction reference" className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

