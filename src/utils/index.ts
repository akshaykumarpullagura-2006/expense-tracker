// Utility helpers

/** Convert minor units (paise) to display currency string */
export function formatCurrency(minorAmount: number, currency = 'INR'): string {
  const major = minorAmount / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(major);
}

/** Convert major amount (₹) to minor units (paise) */
export function toMinor(major: number): number {
  return Math.round(major * 100);
}

/** Convert minor units to major (for display/editing) */
export function toMajor(minor: number): number {
  return minor / 100;
}

/**
 * Split `totalMinor` equally among `count` members.
 * Returns array of shares, distributing remainder to first member.
 */
export function splitEqually(totalMinor: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalMinor / count);
  const remainder = totalMinor - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}

/** Format a date string to DD MMM YYYY */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Relative time (e.g. "2 hours ago") */
export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Get initials from a name */
export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** Group type label */
export function groupTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    trip: 'Trip',
    friends: 'Friends',
    family: 'Family',
    roommates: 'Roommates',
    college: 'College',
    office: 'Office',
    event: 'Event',
    general: 'General',
  };
  return labels[type] ?? type;
}

/** Group type emoji */
export function groupTypeEmoji(type: string): string {
  const emojis: Record<string, string> = {
    trip: '✈️',
    friends: '👫',
    family: '👨‍👩‍👧‍👦',
    roommates: '🏠',
    college: '🎓',
    office: '💼',
    event: '🎉',
    general: '📋',
  };
  return emojis[type] ?? '📋';
}

