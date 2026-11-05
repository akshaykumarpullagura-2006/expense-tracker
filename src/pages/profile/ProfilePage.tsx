import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import { getInitials } from '@/utils';
import { User, Mail, Phone, Loader2, CheckCircle } from 'lucide-react';

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setPhone(profile.phone ?? '');
      setCurrency(profile.preferred_currency ?? 'INR');
    }
  }, [profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('profiles')
      .update({ full_name: fullName, phone, preferred_currency: currency, updated_at: new Date().toISOString() })
      .eq('id', profile!.id);
    if (err) setError(err.message);
    else { setSaved(true); refreshProfile(); setTimeout(() => setSaved(false), 3000); }
    setSaving(false);
  }

  if (!profile) return null;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile & Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account information</p>
      </div>

      {/* Avatar */}
      <div className="card flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-2xl font-bold text-emerald-700">
          {getInitials(profile.full_name)}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{profile.full_name ?? 'Your Name'}</p>
          <p className="text-sm text-gray-500">{profile.email}</p>
        </div>
      </div>

      {/* Form */}
      <div className="card">
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        {saved && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Profile saved!
          </div>
        )}
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="input pl-9" placeholder="Your full name" />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="email" value={profile.email} disabled className="input pl-9 bg-gray-50 text-gray-400 cursor-not-allowed" />
            </div>
            <p className="mt-1 text-xs text-gray-400">Email cannot be changed here</p>
          </div>
          <div>
            <label className="label">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input pl-9" placeholder="+91 9876543210" />
            </div>
          </div>
          <div>
            <label className="label">Preferred Currency</label>
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {['INR','USD','EUR','GBP','AED','SGD'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 px-6">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
          </button>
        </form>
      </div>
    </div>
  );
}

