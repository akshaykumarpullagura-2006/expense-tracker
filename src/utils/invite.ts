// src/utils/invite.ts

/**
 * Returns a clean 6-character invite code for any group.
 * If group.invite_code is set, it uses it.
 * Otherwise, it deterministically extracts the first 6 characters of the group's UUID.
 */
export function getGroupInviteCode(group: { id?: string; invite_code?: string | null } | null | undefined): string {
  if (!group) return '';
  if (group.invite_code && group.invite_code.trim()) {
    return group.invite_code.trim().toUpperCase();
  }
  if (group.id) {
    return group.id.replace(/-/g, '').slice(0, 6).toUpperCase();
  }
  return '';
}

/**
 * Builds the full join URL for a given invite code or group.
 */
export function getGroupInviteLink(codeOrGroup: string | { id?: string; invite_code?: string | null } | null | undefined): string {
  if (!codeOrGroup) return '';
  const code = typeof codeOrGroup === 'string' ? codeOrGroup : getGroupInviteCode(codeOrGroup);
  if (!code) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  return `${origin}/join?code=${code}`;
}

