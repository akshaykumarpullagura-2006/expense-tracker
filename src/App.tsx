import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/common/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';

// Public pages
import LandingPage from '@/pages/public/LandingPage';
import LoginPage from '@/pages/auth/LoginPage';
import SignupPage from '@/pages/auth/SignupPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import JoinGroupPage from '@/pages/groups/JoinGroupPage';

// App pages
import DashboardPage from '@/pages/dashboard/DashboardPage';
import GroupsPage from '@/pages/groups/GroupsPage';
import CreateGroupPage from '@/pages/groups/CreateGroupPage';
import GroupDetailPage from '@/pages/groups/GroupDetailPage';
import GroupSettingsPage from '@/pages/groups/GroupSettingsPage';
import ActivityLogsPage from '@/pages/groups/ActivityLogsPage';
import ExpensesPage from '@/pages/expenses/ExpensesPage';
import AddExpensePage from '@/pages/expenses/AddExpensePage';
import ExpenseDetailPage from '@/pages/expenses/ExpenseDetailPage';
import EditExpensePage from '@/pages/expenses/EditExpensePage';
import BalancesPage from '@/pages/balances/BalancesPage';
import SettlementsPage from '@/pages/settlements/SettlementsPage';
import AnalyticsPage from '@/pages/analytics/AnalyticsPage';
import NotificationsPage from '@/pages/notifications/NotificationsPage';
import ProfilePage from '@/pages/profile/ProfilePage';

function ProtectedApp({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/join" element={<JoinGroupPage />} />
          <Route path="/join/:code" element={<JoinGroupPage />} />
          <Route path="/accept-invitation" element={<JoinGroupPage />} />

          {/* Protected routes */}
          <Route path="/dashboard" element={<ProtectedApp><DashboardPage /></ProtectedApp>} />
          <Route path="/groups" element={<ProtectedApp><GroupsPage /></ProtectedApp>} />
          <Route path="/groups/new" element={<ProtectedApp><CreateGroupPage /></ProtectedApp>} />
          <Route path="/groups/:id" element={<ProtectedApp><GroupDetailPage /></ProtectedApp>} />
          <Route path="/groups/:id/settings" element={<ProtectedApp><GroupSettingsPage /></ProtectedApp>} />
          <Route path="/groups/:id/activity" element={<ProtectedApp><ActivityLogsPage /></ProtectedApp>} />
          <Route path="/expenses" element={<ProtectedApp><ExpensesPage /></ProtectedApp>} />
          <Route path="/expenses/new" element={<ProtectedApp><AddExpensePage /></ProtectedApp>} />
          <Route path="/expenses/:id" element={<ProtectedApp><ExpenseDetailPage /></ProtectedApp>} />
          <Route path="/expenses/:id/edit" element={<ProtectedApp><EditExpensePage /></ProtectedApp>} />
          <Route path="/balances" element={<ProtectedApp><BalancesPage /></ProtectedApp>} />
          <Route path="/settlements" element={<ProtectedApp><SettlementsPage /></ProtectedApp>} />
          <Route path="/analytics" element={<ProtectedApp><AnalyticsPage /></ProtectedApp>} />
          <Route path="/notifications" element={<ProtectedApp><NotificationsPage /></ProtectedApp>} />
          <Route path="/profile" element={<ProtectedApp><ProfilePage /></ProtectedApp>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
