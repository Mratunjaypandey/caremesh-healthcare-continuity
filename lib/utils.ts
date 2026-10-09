import { format } from 'date-fns';

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CM';
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—';
  const d = typeof value === 'string' && value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return format(d, 'dd MMM yyyy');
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return '—';
  return format(new Date(value), 'dd MMM, hh:mm a');
}

export function calculateAge(dob: string) {
  const birth = new Date(`${dob}T12:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const month = now.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
