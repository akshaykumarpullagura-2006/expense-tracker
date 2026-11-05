import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Receipt, Wallet, BarChart2,
  Bell, Settings, LogOut, ChevronDown, Menu, X,
  PlusCircle, UserPlus,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/client';
import { getInitials } from '@/utils';

const navItems = [
  { label: 'Dashboard',   path: '/dashboard',    icon: LayoutDashboard },
  { label: 'Groups',      path: '/groups',        icon: Users },
  { label: 'Expenses',    path: '/expenses',      icon: Receipt },
  { label: 'Balances',    path: '/balances',      icon: Wallet },
  { label: 'Settlements', path: '/settlements',   icon: Wallet },
  { label: 'Analytics',   path: '/analytics',     icon: BarChart2 },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!profile?.id) return;
    loadCounts();

    const notifChannel = supabase
      .channel('layout_notifications_feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, () => loadCounts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: `to_user_id=eq.${profile.id}` }, () => loadCounts())
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
    };
  }, [profile?.id]);

  async function loadCounts() {
    if (!profile?.id) return;
    const [
      { count: nCnt },
      { count: sCnt }
    ] = await Promise.all([
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', profile.id).eq('is_read', false),
      supabase.from('settlements').select('*', { count: 'exact', head: true }).eq('to_user_id', profile.id).eq('status', 'payment_reported'),
    ]);

    setUnreadCount((nCnt ?? 0) + (sCnt ?? 0));
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">₹</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">THE SPLIT</p>
            <p className="text-xs text-emerald-600 font-semibold leading-tight">EXPENSES</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-4 border-b border-gray-100 space-y-1.5">
        <Link
          to="/groups/new"
          className="flex items-center gap-2 w-full px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-xs"
          onClick={() => setSidebarOpen(false)}
        >
          <PlusCircle className="w-4 h-4" /> Create Group
        </Link>
        <Link
          to="/join"
          className="flex items-center gap-2 w-full px-3 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200/60 rounded-lg text-sm font-medium hover:bg-emerald-100/70 transition-colors"
          onClick={() => setSidebarOpen(false)}
        >
          <UserPlus className="w-4 h-4 text-emerald-600" /> Join with Code
        </Link>
        <Link
          to="/expenses/new"
          className="flex items-center gap-2 w-full px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          onClick={() => setSidebarOpen(false)}
        >
          <PlusCircle className="w-4 h-4 text-emerald-600" /> Add Expense
        </Link>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ label, path, icon: Icon }) => {
          const active = location.pathname.startsWith(path);
          return (
            <Link
              key={path}
              to={path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-emerald-600' : 'text-gray-400'}`} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-4 py-4 border-t border-gray-100 space-y-1">
        <Link
          to="/notifications"
          className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="flex items-center gap-3">
            <Bell className="w-4 h-4 text-gray-400" /> Notifications
          </div>
          {unreadCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
        <Link
          to="/profile"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          onClick={() => setSidebarOpen(false)}
        >
          <Settings className="w-4 h-4 text-gray-400" /> Settings
        </Link>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-gray-100 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-72 h-full bg-white shadow-xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <button
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>

          <div className="flex-1 lg:flex-none" />

          {/* Top Bar Right: Notifications Bell & User Menu */}
          <div className="flex items-center gap-2">
            <Link
              to="/notifications"
              className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-amber-500 text-white font-bold text-[9px] flex items-center justify-center animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>

            {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
                {getInitials(profile?.full_name)}
              </div>
              <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
                {profile?.full_name ?? 'User'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-elevated border border-gray-100 py-1 z-50">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">{profile?.full_name}</p>
                  <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
                </div>
                <Link to="/profile" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <Settings className="w-4 h-4 text-gray-400" /> Profile & Settings
                </Link>
                <button onClick={handleSignOut} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            )}
          </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

