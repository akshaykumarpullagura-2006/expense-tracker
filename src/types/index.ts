// All database types matching our Supabase schema

export type UserRole = 'admin' | 'member';
export type MemberStatus = 'active' | 'inactive';
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
export type ExpenseStatus = 'active' | 'reversed';
export type SplitType = 'equal' | 'selected';
export type SettlementStatus = 'pending' | 'payment_reported' | 'confirmed' | 'rejected' | 'cancelled';
export type GroupType = 'trip' | 'friends' | 'family' | 'roommates' | 'college' | 'office' | 'event' | 'general';
export type GroupStatus = 'active' | 'archived';
export type NotificationType =
  | 'invitation_received'
  | 'invitation_accepted'
  | 'invitation_declined'
  | 'expense_added'
  | 'expense_edited'
  | 'expense_reversed'
  | 'member_joined'
  | 'settlement_reported'
  | 'settlement_confirmed'
  | 'settlement_rejected';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  phone: string | null;
  preferred_currency: string;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  type: GroupType;
  cover_image: string | null;
  created_by: string;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  status: GroupStatus;
  invite_code?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  member_count?: number;
  my_role?: UserRole;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: UserRole;
  status: MemberStatus;
  joined_at: string;
  profile?: Profile;
}

export interface Invitation {
  id: string;
  group_id: string;
  email: string;
  invited_by: string;
  token_hash: string | null;
  status: InvitationStatus;
  expires_at: string;
  accepted_by: string | null;
  created_at: string;
  group?: Group;
  inviter?: Profile;
}

export interface Category {
  id: string;
  group_id: string | null;
  name: string;
  icon: string;
  created_at: string;
}

export interface Expense {
  id: string;
  group_id: string;
  title: string;
  amount_minor: number; // in paise for INR
  currency: string;
  category_id: string | null;
  paid_by: string;
  created_by: string;
  split_type: SplitType;
  expense_date: string;
  description: string | null;
  receipt_url: string | null;
  status: ExpenseStatus;
  created_at: string;
  updated_at: string;
  // Joined
  paid_by_profile?: Profile;
  created_by_profile?: Profile;
  category?: Category;
  splits?: ExpenseSplit[];
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  group_id: string;
  user_id: string;
  share_minor: number;
  created_at: string;
  profile?: Profile;
}

export interface Settlement {
  id: string;
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount_minor: number;
  currency: string;
  status: SettlementStatus;
  payment_method: string | null;
  transaction_reference: string | null;
  proof_url: string | null;
  created_by: string;
  confirmed_by: string | null;
  created_at: string;
  confirmed_at: string | null;
  from_user?: Profile;
  to_user?: Profile;
}

export interface ActivityLog {
  id: string;
  group_id: string;
  actor_id: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  actor?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  group_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  group?: Group;
}

export interface MemberBalance {
  user_id: string;
  profile: Profile;
  total_paid_minor: number;
  total_share_minor: number;
  confirmed_received_minor: number;
  confirmed_paid_minor: number;
  net_balance_minor: number; // positive = should receive, negative = needs to pay
}

export interface SettlementSuggestion {
  from_user: Profile;
  to_user: Profile;
  amount_minor: number;
  currency: string;
}

