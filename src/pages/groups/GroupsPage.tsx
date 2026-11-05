import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, Archive, Search, UserPlus, TrendingUp, TrendingDown, CheckCircle2, Receipt } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import { groupTypeEmoji, groupTypeLabel, formatCurrency } from '@/utils';
import { getGroupInviteCode } from '@/utils/invite';
import { calculateGroupDebts } from '@/utils/debts';
import type { Group, Profile } from '@/types';

export default function GroupsPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    loadGroups();

    // Live realtime channel for instantaneous group updates
    const channel = supabase
      .channel('groups_page_feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, () => loadGroups())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => loadGroups())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' }, () => loadGroups())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, () => loadGroups())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  async function loadGroups() {
    setLoading(true);
    const { data: memberRows } = await supabase
      .from('group_members')
      .select('group_id, role')
      .eq('user_id', user!.id)
      .eq('status', 'active');

    const groupIds = (memberRows ?? []).map((r) => r.group_id);
    const roleMap = Object.fromEntries((memberRows ?? []).map((r) => [r.group_id, r.role]));

    if (groupIds.length > 0) {
      const [
        { data: groupData },
        { data: allExpenses },
        { data: allSplits },
        { data: allSettlements },
        { data: allMembers },
      ] = await Promise.all([
        supabase.from('groups').select('*').in('id', groupIds).order('created_at', { ascending: false }),
        supabase.from('expenses').select('id, group_id, amount_minor, paid_by, status').in('group_id', groupIds).eq('status', 'active'),
        supabase.from('expense_splits').select('expense_id, group_id, user_id, share_minor').in('group_id', groupIds),
        supabase.from('settlements').select('group_id, from_user_id, to_user_id, amount_minor, status').in('group_id', groupIds).eq('status', 'confirmed'),
        supabase.from('group_members').select('group_id, user_id, profile:profiles(*)').in('group_id', groupIds).eq('status', 'active'),
      ]);

      const expList = (allExpenses ?? []) as any[];
      const splitList = (allSplits ?? []) as any[];
      const setList = (allSettlements ?? []) as any[];
      const memList = (allMembers ?? []) as any[];

      const enriched = (groupData ?? []).map((g) => {
        const gExpenses = expList.filter((e) => e.group_id === g.id);
        const gSplits = splitList.filter((s) => s.group_id === g.id);
        const gSets = setList.filter((s) => s.group_id === g.id);
        const gMems = memList.filter((m) => m.group_id === g.id);

        const totalSpend = gExpenses.reduce((sum, e) => sum + e.amount_minor, 0);

        const mMap = new Map<string, Profile>();
        for (const m of gMems) {
          const prof = (Array.isArray(m.profile) ? m.profile[0] : m.profile) as Profile | undefined;
          mMap.set(m.user_id, prof || {
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

        const { userBalance } = calculateGroupDebts(gExpenses, gSplits, gSets, mMap, user!.id);
        const net = userBalance.total_take_minor - userBalance.total_give_minor;

        return {
          ...g,
          my_role: roleMap[g.id],
          member_count: gMems.length,
          total_spend: totalSpend,
          user_give: userBalance.total_give_minor,
          user_take: userBalance.total_take_minor,
          user_net: net,
        };
      }) as any[];

      setGroups(enriched);
    } else {
      setGroups([]);
    }
    setLoading(false);
  }

  const filtered = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Groups</h1>
          <p className="text-sm text-gray-500 mt-0.5">{groups.length} group{groups.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/join" className="btn-secondary flex items-center gap-2 text-sm py-2 px-3 text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100">
            <UserPlus className="w-4 h-4 text-emerald-600" /> Join Group
          </Link>
          <Link to="/groups/new" className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
            <Plus className="w-4 h-4" /> Create Group
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search groups…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-9 text-sm"
        />
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-14 h-14 text-gray-200 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-700 mb-1">No groups found</h3>
          <p className="text-sm text-gray-500 mb-4">Create your first group to start splitting expenses</p>
          <Link to="/groups/new" className="btn-primary inline-flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Create Group
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((group) => (
            <Link
              key={group.id}
              to={`/groups/${group.id}`}
              className="card hover:shadow-elevated transition-shadow flex flex-col gap-4 group/card cursor-pointer"
            >
              {/* Cover / emoji */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl flex-shrink-0">
                  {groupTypeEmoji(group.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate group-hover/card:text-emerald-700 transition-colors">
                    {group.name}
                  </h3>
                  <p className="text-xs text-gray-500 capitalize mt-0.5">{groupTypeLabel(group.type)}</p>
                </div>
                {group.status === 'archived' && (
                  <Archive className="w-4 h-4 text-gray-300 flex-shrink-0" />
                )}
              </div>

              {group.description && (
                <p className="text-sm text-gray-500 line-clamp-2">{group.description}</p>
              )}

              {/* Dynamic Group Financial KPI Summary */}
              <div className="grid grid-cols-2 gap-2 bg-gray-50/80 p-2.5 rounded-xl border border-gray-100 text-xs">
                <div>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider block font-semibold">Group Spend</span>
                  <span className="font-extrabold text-gray-900 text-xs">
                    {formatCurrency((group as any).total_spend || 0, group.currency)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider block font-semibold">Your Balance</span>
                  {(group as any).user_net > 0 ? (
                    <span className="font-bold text-emerald-700 text-xs">
                      +{formatCurrency((group as any).user_net, group.currency)}
                    </span>
                  ) : (group as any).user_net < 0 ? (
                    <span className="font-bold text-red-600 text-xs">
                      -{formatCurrency(Math.abs((group as any).user_net), group.currency)}
                    </span>
                  ) : (
                    <span className="font-semibold text-gray-500 text-xs">
                      Settled Up
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    group.my_role === 'admin'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {group.my_role === 'admin' ? 'Admin' : 'Member'}
                  </span>
                  <span className="text-xs text-gray-400 font-medium">
                    {(group as any).member_count || 1} member{((group as any).member_count || 1) !== 1 ? 's' : ''}
                  </span>
                  {getGroupInviteCode(group) && (
                    <span className="text-[11px] font-mono font-semibold px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded border border-emerald-200">
                      #{getGroupInviteCode(group)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400 font-medium">{group.currency}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

