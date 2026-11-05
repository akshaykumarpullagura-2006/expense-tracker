import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const invitationId = searchParams.get('id');

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'login_required'>('loading');
  const [message, setMessage] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setStatus('login_required'); return; }
    if (invitationId) acceptInvitation();
  }, [user, authLoading, invitationId]);

  async function acceptInvitation() {
    if (!invitationId) { setStatus('error'); setMessage('Invalid invitation link'); return; }
    setStatus('loading');

    const { data, error } = await supabase.rpc('accept_invitation', { p_invitation_id: invitationId });

    if (error) {
      setStatus('error');
      setMessage(error.message);
    } else if (data?.error) {
      setStatus('error');
      setMessage(data.error);
    } else {
      setStatus('success');
      setGroupId(data.group_id);
      setTimeout(() => navigate(`/groups/${data.group_id}`), 2000);
    }
  }

  if (status === 'login_required') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-elevated p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📩</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">You've been invited!</h2>
          <p className="text-gray-500 text-sm mb-6">
            Sign in to your account to accept this group invitation.
          </p>
          <Link
            to={`/login?redirect=/accept-invitation?id=${invitationId}`}
            className="btn-primary inline-block px-6"
          >
            Sign in to Accept
          </Link>
          <p className="mt-4 text-sm text-gray-500">
            No account?{' '}
            <Link to={`/signup?redirect=/accept-invitation?id=${invitationId}`} className="text-emerald-600 font-medium">
              Create one first
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-elevated p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-emerald-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900">Accepting invitation…</h2>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Invitation accepted!</h2>
            <p className="text-gray-500 text-sm">Redirecting you to the group…</p>
            {groupId && (
              <Link to={`/groups/${groupId}`} className="mt-4 inline-block text-emerald-600 font-medium text-sm">
                Go to group →
              </Link>
            )}
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Could not accept invitation</h2>
            <p className="text-sm text-red-600 mb-6">{message}</p>
            <Link to="/dashboard" className="btn-primary inline-block px-6">Go to Dashboard</Link>
          </>
        )}
      </div>
    </div>
  );
}

