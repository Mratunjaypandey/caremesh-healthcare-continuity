import Link from 'next/link';
import type { Route } from 'next';
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, FileText, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { calculateAge, formatDate, initials } from '@/lib/utils';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: React.ReactNode; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function MetricCard({ label, value, hint, icon: Icon, tone = 'blue' }: { label: string; value: string | number; hint: string; icon: React.ComponentType<{ size?: number }>; tone?: 'blue'|'green'|'amber'|'red'|'teal' }) {
  return (
    <div className={`metric-card metric-${tone}`}>
      <div className="metric-top"><span>{label}</span><div className="metric-icon"><Icon size={16} /></div></div>
      <div className="metric-value">{value}</div>
      <div className="metric-hint">{hint}</div>
    </div>
  );
}

export function StatusBadge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'blue'|'green'|'amber'|'red'|'slate'|'teal' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function EmptyState({ title, description, icon = FileText }: { title: string; description?: string; icon?: React.ComponentType<{ size?: number }> }) {
  const Icon = icon;
  return <div className="empty-state"><div className="empty-icon"><Icon size={22} /></div><h3>{title}</h3>{description ? <p>{description}</p> : null}</div>;
}

export function PatientHero({ patient, actions }: { patient: any; actions?: React.ReactNode }) {
  return (
    <div className="patient-hero">
      <div className="patient-identity"><div className="patient-avatar">{initials(patient.full_name)}</div><div><div className="eyebrow light">PATIENT MASTER RECORD</div><h2>{patient.full_name}</h2><p>{patient.patient_code} · {patient.gender} · {calculateAge(patient.dob)} yrs · {patient.mobile}</p></div></div>
      {actions ? <div className="patient-actions">{actions}</div> : null}
    </div>
  );
}

export function Timeline({ events }: { events: any[] }) {
  if (!events.length) return <EmptyState title="No timeline events yet" description="Authorized records and patient-submitted entries will appear here." />;
  return (
    <div className="timeline">
      {events.map((event) => (
        <div className="timeline-item" key={event.id}>
          <div className="timeline-line" />
          <div className="timeline-dot" />
          <div className="timeline-card">
            <div className="timeline-head">
              <div><div className="timeline-title">{event.title}</div><div className="timeline-meta">{event.department || 'CareMesh'} · {event.clinician || event.author_name || 'CareMesh'}</div></div>
              <div className="timeline-date">{formatDate(event.event_date)}{event.event_time ? ` · ${event.event_time.slice(0,5)}` : ''}</div>
            </div>
            <div className="timeline-tags"><StatusBadge tone={event.event_type === 'LAB' ? 'teal' : event.event_type === 'ADMISSION' ? 'amber' : event.event_type === 'FOLLOW_UP' ? 'green' : 'blue'}>{event.event_type.replaceAll('_',' ')}</StatusBadge>{event.event_status ? <StatusBadge tone={['FINAL','COMPLETED'].includes(event.event_status) ? 'green' : event.event_status === 'PENDING' ? 'amber' : 'slate'}>{event.event_status}</StatusBadge> : null}</div>
            {event.summary ? <p>{event.summary}</p> : null}
            {event.prescription ? <div className="timeline-note"><strong>Documented prescription:</strong> {event.prescription}</div> : null}
            <div className="timeline-source"><ShieldCheck size={12} /> Source: {event.source_label || 'CareMesh'} · Author role: {event.author_role || '—'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function GapCard({ gap }: { gap: any }) {
  const icon = gap.severity === 'HIGH' ? AlertCircle : gap.severity === 'MEDIUM' ? Clock3 : CheckCircle2;
  const Icon = icon;
  return <div className="gap-card"><div className={`gap-icon gap-${gap.severity.toLowerCase()}`}><Icon size={17} /></div><div className="min-w-0"><div className="gap-card-head"><strong>{gap.gap_type || gap.gapType}</strong><StatusBadge tone={gap.severity === 'HIGH' ? 'red' : gap.severity === 'MEDIUM' ? 'amber' : 'slate'}>{gap.severity}</StatusBadge></div><p>{gap.description}</p></div></div>;
}

export function FeatureStrip() {
  return <div className="feature-strip"><div><Users size={17}/><span>Dual portals</span></div><div><Clock3 size={17}/><span>Longitudinal timeline</span></div><div><AlertCircle size={17}/><span>Care-gap detection</span></div><div><Sparkles size={17}/><span>AI summaries</span></div></div>;
}

export function QuickLink({ href, title, description, icon: Icon }: { href: Route; title: string; description: string; icon: React.ComponentType<{ size?: number }> }) {
  return <Link className="quick-link" href={href}><div className="quick-icon"><Icon size={17}/></div><div><strong>{title}</strong><span>{description}</span></div><ArrowRight size={15}/></Link>;
}
