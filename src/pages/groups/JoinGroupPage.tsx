import { useState, useEffect } from 'react';
import { useSearchParams, useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import { Users, ArrowRight, Loader2, CheckCircle2, AlertCircle, Sparkles, LogIn } from 'lucide-react';
import { groupTypeEmoji } from '@/utils';

interface GroupPreview {
  id: string;
  name: string;
  description: string | null;
  type: string;
  currency: string;
  created_by_name: string;
  member_count: number;
  invite_code: string;
}

export default function JoinGroupPage() {
  const [searchParams] = useSearchParams();
  const { code: pathCode } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const initialCode = (pathCode || searchParams.get('code') || searchParams.get('id') || '').toUpperCase().trim();
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // When initialCode is available or user types a 6-digit code, fetch preview
  useEffect(() => {
    if (code.length >= 6) {
      fetchPreview(code);
    } else {
      setPreview(null);
    }
  }, [code]);

  async function fetchPreview(targetCode: string) {
    setLoadingPreview(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('get_group_preview_by_code', {
        p_code: targetCode.trim().toUpperCase(),
      });

      if (error || !data || data.error) {
        setPreview(null);
        if (targetCode.length >= 6) {
          setError(data?.error || 'Invalid or expired invite code');
        }
      } else {
        setPreview(data as GroupPreview);
        setError(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not load group preview');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleJoin(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setError('Please enter a 6-digit invite code');
      return;
    }

    if (!user) {
      // Redirect to login preserving the join code
      navigate(`/login?redirect=${encodeURIComponent(`/join?code=${cleanCode}`)}`);
      return;
    }

    setJoining(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data, error } = await supabase.rpc('join_group_by_code', {
        p_code: cleanCode,
      });

      if (error || !data) {
        setError(error?.message || 'Failed to join group');
        setJoining(false);
        return;
      }

      if (data.error) {
        setError(data.error);
        setJoining(false);
        return;
      }

      setSuccessMessage(data.message || 'Successfully joined!');
      setTimeout(() => {
        navigate(`/groups/${data.group_id}`);
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred');
      setJoining(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-6">
          <Link to="/" className="inline-flex items-center gap-2 mb-2">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-lg">₹</span>
            </div>
            <span className="text-xl font-bold text-gray-900 tracking-tight">THE SPLIT EXPENSES</span>
          </Link>
          <p className="text-sm text-gray-500">Join a shared expense group</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-elevated border border-gray-100 p-6 sm:p-8 space-y-6">
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-emerald-700">
              <Users className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Join Group</h1>
            <p className="text-xs text-gray-500 mt-1">
              Enter the 6-character code or use the link shared by your team
            </p>
          </div>

          {/* Feedback messages */}
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
              <div className="flex-1 text-xs leading-relaxed">{error}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 flex items-center gap-2.5 animate-pulse">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div className="font-medium text-xs">{successMessage} Redirecting…</div>
            </div>
          )}

          {/* Code Input Form */}
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2 text-center">
                6-Character Invite Code
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={10}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
                  placeholder="e.g. 7X9K2P"
                  className="w-full text-center text-2xl tracking-[0.35em] font-mono font-bold py-3.5 px-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:bg-white focus:outline-none transition-all uppercase"
                  autoFocus={!initialCode}
                  required
                />
                {loadingPreview && (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                  </div>
                )}
              </div>
            </div>

            {/* Group Preview Card if code matches */}
            {preview && (
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-2xl flex-shrink-0">
                    {groupTypeEmoji(preview.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs px-2 py-0.5 bg-emerald-200/80 text-emerald-800 rounded font-medium capitalize">
                        {preview.type}
                      </span>
                      <span className="text-xs text-gray-400 font-medium">({preview.currency})</span>
                    </div>
                    <h3 className="text-base font-bold text-gray-900 truncate mt-0.5">{preview.name}</h3>
                    <p className="text-xs text-gray-500">
                      Organized by <span className="font-medium text-gray-700">{preview.created_by_name}</span> · {preview.member_count} member{preview.member_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {preview.description && (
                  <p className="text-xs text-gray-600 mt-2.5 pt-2 border-t border-emerald-200/60 line-clamp-2 italic">
                    "{preview.description}"
                  </p>
                )}
              </div>
            )}

            {/* If user is not logged in, prompt sign in or sign up */}
            {!user && !authLoading ? (
              <div className="space-y-3 pt-2">
                <p className="text-xs text-center text-gray-500">
                  You must have an account to join this group.
                </p>
                <Link
                  to={`/login?redirect=${encodeURIComponent(`/join?code=${code}`)}`}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold shadow-sm"
                >
                  <LogIn className="w-4 h-4" />
                  Sign in to Join
                </Link>
                <Link
                  to={`/signup?redirect=${encodeURIComponent(`/join?code=${code}`)}`}
                  className="btn-secondary w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium"
                >
                  Create New Account
                </Link>
              </div>
            ) : (
              <button
                type="submit"
                disabled={joining || !code.trim()}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold shadow-md transition-all mt-3"
              >
                {joining ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Joining Group…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {preview ? `Join ${preview.name}` : 'Join Group'}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </form>

          {/* Quick links */}
          <div className="pt-2 text-center border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <Link to="/dashboard" className="hover:text-emerald-600 transition-colors">
              ← Back to Dashboard
            </Link>
            <Link to="/groups/new" className="text-emerald-600 font-medium hover:underline">
              Create a group instead
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

