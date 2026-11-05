import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Users, Receipt, Wallet, Settings,
  UserPlus, Mail, Loader2, CheckCircle, XCircle, Crown,
  Copy, Check, Share2, Sparkles, X, TrendingDown, TrendingUp,
  ArrowRight, HandCoins, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import { formatCurrency, getInitials, groupTypeEmoji, relativeTime } from '@/utils';
import { getGroupInviteCode, getGroupInviteLink } from '@/utils/invite';
import { calculateGroupDebts, type PairwiseDebt, type UserGroupBalance } from '@/utils/debts';
import type { Group, GroupMember, Expense, Invitation, Settlement, Profile } from '@/types';

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [myRole, setMyRole] = useState<'admin' | 'member' | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'members' | 'invitations'>('expenses');

  // Pairwise Debts & User Balance
  const [userBalance, setUserBalance] = useState<UserGroupBalance>({
    total_give_minor: 0,
    give_to: [],
    total_take_minor: 0,
    take_from: [],
    net_balance_minor: 0,
  });
  const [allDebts, setAllDebts] = useState<PairwiseDebt[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [processingSettlementId, setProcessingSettlementId] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Settlements waiting for confirmation
  const pendingConfirmations = settlements.filter(
    (s) => s.to_user_id === user?.id && s.status === 'payment_reported'
  );
  const myReportedPayments = settlements.filter(
    (s) => s.from_user_id === user?.id && s.status === 'payment_reported'
  );

  // Settle Payment Modal
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleToUser, setSettleToUser] = useState<{ id: string; name: string } | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState('UPI');
  const [settleRef, setSettleRef] = useState('');
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  function openSettleModal(toUserId: string, toUserName: string, amountMinor: number) {
    setSettleToUser({ id: toUserId, name: toUserName });
    setSettleAmount((amountMinor / 100).toFixed(2));
    setSettleError(null);
    setShowSettleModal(true);
  }

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Invite Code & Share
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const inviteCode = getGroupInviteCode(group);
  const inviteLink = getGroupInviteLink(group);

  function handleCopyCode() {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  function handleCopyLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  function handleShareWhatsApp() {
    if (!group || !inviteCode) return;
    const text = encodeURIComponent(
      `Hey! Join our group "${group.name}" on THE SPLIT EXPENSES.\n\nUse Code: ${inviteCode}\nOr click link: ${inviteLink}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  }

  function handleSendWhatsAppReminder(debtorName: string, amountMinor: number, phone?: string | null) {
    if (!group) return;
    const formattedAmount = formatCurrency(amountMinor, group.currency);
    const myName = profile?.full_name || user?.user_metadata?.full_name || 'Your group member';
    const groupLink = getGroupInviteLink(group);

    const message = encodeURIComponent(
      `Hey ${debtorName}! 👋\n\nFriendly reminder regarding our group "${group.name}" on THE SPLIT EXPENSES.\n\n💰 Pending Amount: ${formattedAmount}\n👤 You need to send this amount to: ${myName}\n\nPlease settle up when you get a chance! Once sent, report it on the app.\n\nGroup Link: ${groupLink}`
    );

    let cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone; // Default to India prefix if 10-digit
    }

    const waUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${message}`
      : `https://api.whatsapp.com/send?text=${message}`;

    window.open(waUrl, '_blank');
  }

  useEffect(() => {
    if (!id || !user) return;
    loadGroup();

    // Live realtime channel for instantaneous KPI & balance updates
    const channel = supabase
      .channel(`group_${id}_realtime_feed`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `group_id=eq.${id}` }, () => loadGroup())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_splits', filter: `group_id=eq.${id}` }, () => loadGroup())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: `group_id=eq.${id}` }, () => loadGroup())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${id}` }, () => loadGroup())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, user]);

  async function loadGroup() {
    setLoading(true);
    const [
      { data: gData },
      { data: memberData },
      { data: expData },
      { data: splitsData },
      { data: settlementsData },
    ] = await Promise.all([
      supabase.from('groups').select('*').eq('id', id!).single(),
      supabase.from('group_members').select('*, profile:profiles(*)').eq('group_id', id!).eq('status', 'active'),
      supabase
        .from('expenses')
        .select('*, paid_by_profile:profiles!expenses_paid_by_fkey(id,full_name,email,avatar_url)')
        .eq('group_id', id!)
        .eq('status', 'active')
        .order('expense_date', { ascending: false }),
      supabase.from('expense_splits').select('expense_id, user_id, share_minor').eq('group_id', id!),
      supabase
        .from('settlements')
        .select('*, from_user:profiles!settlements_from_user_id_fkey(*), to_user:profiles!settlements_to_user_id_fkey(*)')
        .eq('group_id', id!)
        .order('created_at', { ascending: false }),
    ]);

    if (!gData) { navigate('/groups'); return; }
    setGroup(gData as Group);

    const mems = (memberData ?? []) as GroupMember[];
    setMembers(mems);
    const mine = mems.find((m) => m.user_id === user!.id);
    setMyRole(mine?.role ?? null);

    setExpenses((expData ?? []) as Expense[]);
    setSettlements((settlementsData ?? []) as Settlement[]);

    // Build members map & compute pairwise debts (only confirmed settlements affect balance)
    const membersMap = new Map<string, Profile>();
    for (const m of mems) {
      if (m.profile) membersMap.set(m.user_id, m.profile);
    }

    const confirmedSettlements = (settlementsData ?? []).filter((s: any) => s.status === 'confirmed');

    const { allDebts: debts, userBalance: balance } = calculateGroupDebts(
      (expData ?? []) as any[],
      (splitsData ?? []) as any[],
      confirmedSettlements as any[],
      membersMap,
      user!.id
    );

    setAllDebts(debts);
    setUserBalance(balance);

    if (mine?.role === 'admin') {
      const { data: invData } = await supabase
        .from('invitations')
        .select('*')
        .eq('group_id', id!)
        .order('created_at', { ascending: false });
      setInvitations((invData ?? []) as Invitation[]);
    }

    setLoading(false);
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!settleToUser || !settleAmount || !group) return;
    setSettling(true);
    setSettleError(null);

    const amountMinor = Math.round(parseFloat(settleAmount) * 100);
    if (isNaN(amountMinor) || amountMinor <= 0) {
      setSettleError('Please enter a valid amount');
      setSettling(false);
      return;
    }

    // Insert with status: 'payment_reported' so recipient must confirm it!
    const { error } = await supabase.from('settlements').insert({
      group_id: group.id,
      from_user_id: user!.id,
      to_user_id: settleToUser.id,
      amount_minor: amountMinor,
      currency: group.currency,
      status: 'payment_reported',
      payment_method: settleMethod,
      transaction_reference: settleRef || null,
      created_by: user!.id,
    });

    if (error) {
      setSettleError(error.message);
      setSettling(false);
    } else {
      // Send notification to recipient
      await supabase.from('notifications').insert({
        user_id: settleToUser.id,
        group_id: group.id,
        type: 'settlement_reported',
        title: 'Payment Reported',
        message: `${user?.user_metadata?.full_name || 'A member'} reported paying you ${formatCurrency(amountMinor, group.currency)} in ${group.name}. Please confirm receipt.`,
      });

      setShowSettleModal(false);
      setSettling(false);
      loadGroup();
    }
  }

  async function handleConfirmSettlement(settlementId: string) {
    setProcessingSettlementId(settlementId);
    setActionSuccessMsg(null);
    try {
      const { data, error } = await supabase.rpc('confirm_settlement_payment', {
        p_settlement_id: settlementId,
      });

      if (error || data?.error) {
        // Direct fallback update
        await supabase
          .from('settlements')
          .update({
            status: 'confirmed',
            confirmed_by: user!.id,
            confirmed_at: new Date().toISOString(),
          })
          .eq('id', settlementId);
      }

      setActionSuccessMsg('Payment confirmed! Debt has been officially settled.');
      setTimeout(() => setActionSuccessMsg(null), 4000);
      loadGroup();
    } catch (err: any) {
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

      loadGroup();
    } catch (err: any) {
      console.error('Error rejecting settlement:', err);
    } finally {
      setProcessingSettlementId(null);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !id) return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(false);

    // Check if user with that email exists
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', inviteEmail.trim().toLowerCase())
      .single();

    if (!profileData) {
      setInviteError('No account found with that email. The person must create an account first.');
      setInviting(false);
      return;
    }

    // Check if already a member
    const alreadyMember = members.some((m) => m.user_id === profileData.id);
    if (alreadyMember) {
      setInviteError('This person is already a member of the group.');
      setInviting(false);
      return;
    }

    // Check pending invite
    const { data: existing } = await supabase
      .from('invitations')
      .select('id, status')
      .eq('group_id', id)
      .eq('email', inviteEmail.trim().toLowerCase())
      .in('status', ['pending'])
      .single();

    if (existing) {
      setInviteError('A pending invitation already exists for this email.');
      setInviting(false);
      return;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error } = await supabase.from('invitations').insert({
      group_id: id,
      email: inviteEmail.trim().toLowerCase(),
      invited_by: user!.id,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    });

    if (error) {
      setInviteError(error.message);
    } else {
      setInviteSuccess(true);
      setInviteEmail('');
      loadGroup();
    }
    setInviting(false);
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!group) return null;

  const totalGroupSpent = expenses.reduce((sum, e) => sum + e.amount_minor, 0);
  const myTotalPaid = expenses.filter((e) => e.paid_by === user?.id).reduce((sum, e) => sum + e.amount_minor, 0);

  const tabs = [
    { id: 'expenses',    label: 'Expenses',    count: expenses.length },
    { id: 'balances',    label: 'Balances & Debts', count: allDebts.length },
    { id: 'members',     label: 'Members',     count: members.length },
    ...(myRole === 'admin' ? [{ id: 'invitations', label: 'Invitations', count: invitations.filter(i => i.status === 'pending').length }] : []),
  ] as const;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link to="/groups" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft className="w-4 h-4" /> All Groups
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl">
              {groupTypeEmoji(group.type)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
              <p className="text-sm text-gray-500 capitalize">{group.type} · {group.currency}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowInviteModal(true)}
              className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-3 text-emerald-700 bg-emerald-50/70 border-emerald-200 hover:bg-emerald-100/80"
            >
              <UserPlus className="w-4 h-4 text-emerald-600" /> Invite
            </button>
            <Link
              to={`/expenses/new?group=${id}`}
              className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3"
            >
              <Plus className="w-4 h-4" /> Add Expense
            </Link>
            {myRole === 'admin' && (
              <Link
                to={`/groups/${id}/settings`}
                className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-3"
              >
                <Settings className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* 6-Digit Invite Code Banner */}
      {inviteCode && (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
              #
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Group Invite Code:</span>
                <span className="text-base font-mono font-extrabold tracking-widest text-emerald-900 bg-white/80 px-2 py-0.5 rounded border border-emerald-200">
                  {inviteCode}
                </span>
              </div>
              <p className="text-xs text-emerald-700 mt-0.5">
                Registered users can join instantly using this 6-character code or the direct link.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCopyCode}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors shadow-xs"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCode ? 'Copied Code' : 'Copy Code'}
            </button>
            <button
              onClick={handleCopyLink}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors shadow-xs"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
              {copiedLink ? 'Copied Link' : 'Copy Link'}
            </button>
            <button
              onClick={handleShareWhatsApp}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-transparent transition-colors shadow-xs"
            >
              Share WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* Success banner if action just confirmed */}
      {actionSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* ACTION REQUIRED: Pending Payment Confirmation Banner */}
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
                      Action Required: Confirm Payment
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {relativeTime(settlement.created_at)}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-gray-900 mt-1">
                    {(settlement as any).from_user?.full_name || 'A group member'} reported paying you{' '}
                    <span className="text-emerald-700 text-base font-extrabold">
                      {formatCurrency(settlement.amount_minor, group.currency)}
                    </span>
                    {settlement.payment_method ? ` via ${settlement.payment_method}` : ''}
                  </h4>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {settlement.transaction_reference ? (
                      <span className="font-medium text-gray-800 bg-white/80 px-1.5 py-0.5 rounded border border-amber-200 mr-1.5 font-mono">
                        Ref: {settlement.transaction_reference}
                      </span>
                    ) : null}
                    Did you receive this money? Click <strong>"Yes, Confirm Settled"</strong> to officially clear the balance.
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

      {/* Info: Payments reported by current user awaiting recipient confirmation */}
      {myReportedPayments.length > 0 && (
        <div className="space-y-2">
          {myReportedPayments.map((settlement) => (
            <div
              key={settlement.id}
              className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900 gap-3 shadow-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base flex-shrink-0">⏳</span>
                <span className="truncate">
                  You reported paying <strong>{formatCurrency(settlement.amount_minor, group.currency)}</strong> to{' '}
                  <strong>{(settlement as any).to_user?.full_name || 'Member'}</strong>. Waiting for them to confirm receipt.
                </span>
              </div>
              <span className="font-bold text-[11px] text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full flex-shrink-0">
                Awaiting Confirmation
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Group Financial Overview KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="card p-4 flex flex-col gap-1.5 bg-white border-gray-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Spent</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <span className="text-xl font-black text-gray-900 mt-1">
            {formatCurrency(totalGroupSpent, group.currency)}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            {expenses.length} expense{expenses.length !== 1 ? 's' : ''} recorded
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
            {formatCurrency(myTotalPaid, group.currency)}
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
            {formatCurrency(userBalance.total_give_minor, group.currency)}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            {userBalance.give_to.length} pending payment{userBalance.give_to.length !== 1 ? 's' : ''}
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
            {formatCurrency(userBalance.total_take_minor, group.currency)}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">
            {userBalance.take_from.length} incoming settlement{userBalance.take_from.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Give & Take Money Financial Standing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* GIVE MONEY (You Owe) */}
        <div className="card border-red-200/70 bg-gradient-to-br from-red-50/50 via-white to-red-50/20 p-5 space-y-3.5 relative shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-red-600 uppercase tracking-wider block">
                  Give Money (You Owe)
                </span>
                <p className="text-xs text-gray-500">Total amount you need to pay</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-red-600">
                {formatCurrency(userBalance.total_give_minor, group.currency)}
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
                      <div className="min-w-0">
                        <span className="font-semibold text-gray-900 block truncate">
                          {item.profile?.full_name || 'Member'}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {item.profile?.email}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      <span className="font-extrabold text-sm text-red-600">
                        {formatCurrency(item.amount_minor, group.currency)}
                      </span>
                      <button
                        onClick={() => openSettleModal(item.user_id, item.profile?.full_name || 'Member', item.amount_minor)}
                        className="btn-primary text-xs py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1 shadow-xs font-semibold"
                      >
                        <HandCoins className="w-3.5 h-3.5" />
                        Settle Up
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="pt-2.5 border-t border-red-100/60 text-xs text-gray-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>You don't need to give money to anyone in this group!</span>
            </div>
          )}
        </div>

        {/* TAKE MONEY (You are Owed) */}
        <div className="card border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-emerald-50/20 p-5 space-y-3.5 relative shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider block">
                  Take Money (You are Owed)
                </span>
                <p className="text-xs text-gray-500">Total amount you will receive</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-emerald-700">
                {formatCurrency(userBalance.total_take_minor, group.currency)}
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
                      <div className="min-w-0">
                        <span className="font-semibold text-gray-900 block truncate">
                          {item.profile?.full_name || 'Member'}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {item.profile?.email}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-extrabold text-sm text-emerald-700">
                        {formatCurrency(item.amount_minor, group.currency)}
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
              <span>No one owes you money in this group right now.</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  activeTab === tab.id ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Expenses Tab */}
      {activeTab === 'expenses' && (
        <div className="space-y-3">
          {expenses.length === 0 ? (
            <div className="text-center py-16 card">
              <Receipt className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600 mb-1">No expenses yet</p>
              <p className="text-xs text-gray-400 mb-4">Every member can add an expense</p>
              <Link to={`/expenses/new?group=${id}`} className="btn-primary inline-flex items-center gap-1.5 text-sm">
                <Plus className="w-4 h-4" /> Add First Expense
              </Link>
            </div>
          ) : (
            expenses.map((expense) => (
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
                    Paid by {(expense as any).paid_by_profile?.full_name ?? 'Unknown'} · {relativeTime(expense.created_at)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-semibold text-gray-900">{formatCurrency(expense.amount_minor, expense.currency)}</p>
                  <p className="text-xs text-gray-400 capitalize">{expense.split_type} split</p>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {/* Balances & Debts Tab */}
      {activeTab === 'balances' && (
        <div className="space-y-5">
          {/* Pairwise Debts: Who Owes Whom */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Who Owes Whom</h3>
                <p className="text-xs text-gray-500">Suggested payments to settle all group debts</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 rounded-full text-gray-700">
                {allDebts.length} pending settlement{allDebts.length !== 1 ? 's' : ''}
              </span>
            </div>

            {allDebts.length === 0 ? (
              <div className="text-center py-10">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-gray-800">Everyone is all settled up!</h4>
                <p className="text-xs text-gray-400 mt-1">There are no outstanding balances between any members.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allDebts.map((debt, index) => {
                  const isUserDebtor = debt.debtor_id === user?.id;
                  const isUserCreditor = debt.creditor_id === user?.id;
                  return (
                    <div
                      key={index}
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        isUserDebtor
                          ? 'border-red-200 bg-red-50/30'
                          : isUserCreditor
                          ? 'border-emerald-200 bg-emerald-50/30'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      {/* Flow: Debtor -> Creditor */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Debtor */}
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {getInitials(debt.debtor?.full_name)}
                          </div>
                          <span className="text-xs font-bold text-gray-900 truncate">
                            {isUserDebtor ? 'You' : debt.debtor?.full_name || 'Member'}
                          </span>
                        </div>

                        {/* Arrow & Label */}
                        <div className="flex items-center gap-1.5 text-gray-400 px-1">
                          <span className="text-xs font-medium text-gray-500 hidden sm:inline">owes</span>
                          <ArrowRight className="w-4 h-4 text-gray-400" />
                        </div>

                        {/* Creditor */}
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {getInitials(debt.creditor?.full_name)}
                          </div>
                          <span className="text-xs font-bold text-gray-900 truncate">
                            {isUserCreditor ? 'You' : debt.creditor?.full_name || 'Member'}
                          </span>
                        </div>
                      </div>

                      {/* Amount and Action */}
                      <div className="flex items-center gap-3 justify-between sm:justify-end">
                        <span className="font-extrabold text-base text-gray-900">
                          {formatCurrency(debt.amount_minor, group.currency)}
                        </span>
                        {isUserDebtor && (
                          <button
                            onClick={() => openSettleModal(debt.creditor_id, debt.creditor?.full_name || 'Member', debt.amount_minor)}
                            className="btn-primary text-xs py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 shadow-xs"
                          >
                            <HandCoins className="w-3.5 h-3.5" />
                            Pay Now
                          </button>
                        )}
                        {isUserCreditor && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              Owed to you
                            </span>
                            <button
                              onClick={() => handleSendWhatsAppReminder(debt.debtor?.full_name || 'Member', debt.amount_minor, debt.debtor?.phone)}
                              className="btn-secondary text-[11px] py-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1 font-semibold shadow-xs border-transparent transition-colors"
                              title="Send WhatsApp payment reminder"
                            >
                              <Share2 className="w-3 h-3" />
                              Remind
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.id} className="card flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700 flex-shrink-0">
                {getInitials(member.profile?.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{member.profile?.full_name ?? 'Unknown'}</p>
                <p className="text-xs text-gray-500 truncate">{member.profile?.email}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {member.role === 'admin' && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  member.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {member.role === 'admin' ? 'Admin' : 'Member'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invitations Tab */}
      {activeTab === 'invitations' && myRole === 'admin' && (
        <div className="space-y-5">
          {/* Invite Form */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-600" /> Invite a Member
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              The person must already have an account on The Split Expenses.
            </p>
            {inviteError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{inviteError}</div>
            )}
            {inviteSuccess && (
              <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> Invitation sent!
              </div>
            )}
            <form onSubmit={sendInvite} className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  placeholder="friend@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="input pl-9"
                  required
                />
              </div>
              <button type="submit" disabled={inviting} className="btn-primary flex items-center gap-1.5 px-4 whitespace-nowrap">
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Invite
              </button>
            </form>
          </div>

          {/* Invitation List */}
          {invitations.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Sent Invitations</h4>
              {invitations.map((inv) => (
                <div key={inv.id} className="card flex items-center gap-3 py-3 px-4">
                  <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{inv.email}</p>
                    <p className="text-xs text-gray-400">{relativeTime(inv.created_at)}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                    inv.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                    inv.status === 'declined' ? 'bg-red-100 text-red-700' :
                    inv.status === 'revoked'  ? 'bg-gray-200 text-gray-600' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setShowInviteModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-elevated border border-gray-100 p-6 w-full max-w-md space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-gray-900 text-base">Invite to {group.name}</h3>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Method 1: 6-Digit Code */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider block">
                Method 1: 6-Digit Invite Code
              </label>
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
                <span className="font-mono text-2xl font-black tracking-widest text-emerald-900">
                  {inviteCode || '------'}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? 'Copied' : 'Copy Code'}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Any registered member can type this code under <strong>"Join Group"</strong> to join instantly.
              </p>
            </div>

            {/* Method 2: Direct Share Link */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider block">
                Method 2: Direct Join Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  className="input text-xs font-mono py-2 bg-gray-50 text-gray-600 flex-1 truncate"
                />
                <button
                  onClick={handleCopyLink}
                  className="btn-primary text-xs py-2 px-3 flex items-center gap-1 flex-shrink-0"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLink ? 'Copied' : 'Copy'}
                </button>
              </div>
              <button
                onClick={handleShareWhatsApp}
                className="w-full btn-secondary text-xs py-2 flex items-center justify-center gap-2 bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
              >
                <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                Share via WhatsApp
              </button>
            </div>

            {/* Method 3: Email Invite */}
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider block">
                Method 3: Invite by Email
              </label>
              {inviteError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{inviteError}</div>
              )}
              {inviteSuccess && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Invitation sent!
                </div>
              )}
              <form onSubmit={sendInvite} className="flex gap-2">
                <input
                  type="email"
                  placeholder="friend@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="input text-xs py-2 flex-1"
                />
                <button type="submit" disabled={inviting} className="btn-secondary text-xs px-3 whitespace-nowrap">
                  {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Send'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Quick Settle Payment Modal */}
      {showSettleModal && settleToUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setShowSettleModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-elevated border border-gray-100 p-6 w-full max-w-sm space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <HandCoins className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-gray-900 text-base">Settle Up Payment</h3>
              </div>
              <button onClick={() => setShowSettleModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {settleError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {settleError}
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="space-y-3.5">
              <div>
                <label className="label text-xs">Paying To</label>
                <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg font-semibold text-gray-900 text-sm">
                  {settleToUser.name}
                </div>
              </div>

              <div>
                <label className="label text-xs">Amount ({group.currency}) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="input text-sm font-bold"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="label text-xs">Payment Method</label>
                <select
                  value={settleMethod}
                  onChange={(e) => setSettleMethod(e.target.value)}
                  className="input text-xs"
                >
                  <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer (IMPS / NEFT)</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="label text-xs">UPI Ref / Notes (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. UPI Ref / Sent"
                  value={settleRef}
                  onChange={(e) => setSettleRef(e.target.value)}
                  className="input text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="btn-secondary flex-1 text-xs py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settling}
                  className="btn-primary flex-1 text-xs py-2 flex items-center justify-center gap-1.5 font-semibold"
                >
                  {settling ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

