import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Clock } from 'lucide-react';
import { supabase } from '@/services/supabase/client';
import { relativeTime, getInitials } from '@/utils';
import type { ActivityLog } from '@/types';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  group_created:       { label: 'Created group',       color: 'emerald' },
  invitation_sent:     { label: 'Invited member',       color: 'blue' },
  member_joined:       { label: 'Joined group',         color: 'emerald' },
  expense_created:     { label: 'Added expense',        color: 'blue' },
  expense_updated:     { label: 'Edited expense',       color: 'yellow' },
  expense_reversed:    { label: 'Reversed expense',     color: 'red' },
  settlement_created:  { label: 'Recorded payment',     color: 'yellow' },
  settlement_confirmed:{ label: 'Confirmed payment',    color: 'emerald' },
  group_settings_changed: { label: 'Updated settings',  color: 'gray' },
};

export default function ActivityLogsPage() {
  const { id } = useParams<{ id: string }>();
  const [logs, setLogs] = useState<(ActivityLog & { actor: { full_name: string } })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (id) loadLogs(); }, [id]);

  async function loadLogs() {
    setLoading(true);
    const { data } = await supabase
      .from('activity_logs')
      .select('*, actor:profiles(full_name)')
      .eq('group_id', id!)
      .order('created_at', { ascending: false })
      .limit(100);
    setLogs((data ?? []) as any[]);
    setLoading(false);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <Link to={`/groups/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to Group
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
        <p className="text-sm text-gray-500 mt-0.5">Every action taken in this group</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        </div>
      ) : logs.length === 0 ? (
        <div className="card text-center py-12">
          <Clock className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No activity recorded yet</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
          <div className="space-y-4">
            {logs.map((log) => {
              const meta = ACTION_LABELS[log.action_type] ?? { label: log.action_type, color: 'gray' };
              const colorMap: Record<string, string> = {
                emerald: 'bg-emerald-100 text-emerald-700',
                blue:    'bg-blue-100 text-blue-700',
                yellow:  'bg-yellow-100 text-yellow-700',
                red:     'bg-red-100 text-red-700',
                gray:    'bg-gray-100 text-gray-600',
              };
              return (
                <div key={log.id} className="relative pl-10">
                  <div className="absolute left-2 top-2 w-4 h-4 rounded-full bg-white border-2 border-emerald-400 flex-shrink-0" />
                  <div className="card py-3 px-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700 flex-shrink-0">
                        {getInitials((log.actor as any)?.full_name)}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{(log.actor as any)?.full_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorMap[meta.color]}`}>
                        {meta.label}
                      </span>
                      <span className="text-xs text-gray-400 ml-auto">{relativeTime(log.created_at)}</span>
                    </div>
                    {log.new_values && Object.keys(log.new_values).length > 0 && (
                      <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 font-mono">
                        {JSON.stringify(log.new_values)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

