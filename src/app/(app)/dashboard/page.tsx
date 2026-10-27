import Link from 'next/link';
import { LinkRequestPanel, NotificationsPanel } from '@/components/StudentPanels';
import { SegBar, StatusPill } from '@/components/ui';
import { formatClock, formatDay } from '@/lib/client/api';
import { DOC_STATUS_LABEL, STAGES, STAGE_LABEL, stageIndex } from '@/lib/stages';
import { pendingActions } from '@/lib/student/actions';
import { getStudentContext } from '@/lib/student/context';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

const LABELS: Record<string, string> = {
  not_allotted: 'Not allotted', allotted: 'Allotted', waiting: 'On waiting list', frozen: 'Seat frozen', cancelled: 'Cancelled',
  submitted: 'Submitted', under_review: 'Under review', confirmed: 'Confirmed', pending: 'Pending', verified: 'Verified', rejected: 'Rejected',
};
const EVENT_LABEL: Record<string, string> = { allotted: 'Allotted', betterment: 'Moved to a better preference', promoted: 'Promoted from waiting list', frozen: 'Seat frozen', cancelled: 'Cancelled', waiting: 'Waiting list' };

export default async function DashboardPage() {
  const { snapshot: s } = await getStudentContext();
  const actions = pendingActions(s);
  const docsReady = s.documents.filter((d) => d.status === 'ready' || d.status === 'verified').length;
  const stage = s.workspace?.stage;
  const upcoming = s.appointments.filter((a) => a.status === 'scheduled');
  const isDemo = s.workspace?.isSynthetic || s.record?.is_synthetic;

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-4">
        <div>
          <h1 className="page-title mb-1">Hello, {s.fullName}</h1>
          <p className="text-muted mb-0">
            CAP Application ID <strong data-testid="cap-id">{s.capId}</strong>{' '}
            {isDemo ? <span className="demo-badge ms-1">Demonstration data (fictional)</span> : null}
          </p>
        </div>
        <StatusPill
          status={s.state === 'linked' ? 'linked' : s.state === 'pending_verification' ? 'pending_verification' : 'record_unavailable'}
          label={s.state === 'linked' ? 'Record linked' : s.state === 'pending_verification' ? 'Verification pending' : 'Record not available'}
        />
      </div>

      {s.state !== 'linked' ? (
        <section className="panel mb-4" aria-labelledby="unavail" data-testid="record-unavailable">
          <h2 className="panel-title" id="unavail">
            {s.state === 'pending_verification' ? 'Verification pending' : 'Admission details are not available yet'}
          </h2>
          {s.state === 'pending_verification' ? (
            <p className="text-muted mb-0">
              A record exists for your CAP ID, but ownership has not been verified. For your protection, none of its details are shown until the admission cell approves the link.
            </p>
          ) : s.state === 'record_unavailable' ? (
            <>
              <p className="text-muted">
                Your account and workspace are saved, but no admission record is linked to CAP ID <strong>{s.capId}</strong> in this system yet. Allotment, college and round details will appear here once
                staff create or link a record. You can already save your preferences and prepare your documents.
              </p>
              <LinkRequestPanel capId={s.capId ?? ''} status={s.linkRequest?.status ?? null} reviewNote={s.linkRequest?.reviewNote ?? null} />
            </>
          ) : (
            <p className="text-muted mb-0">
              Your claim on this CAP ID was not approved{s.linkRequest?.reviewNote ? `: ${s.linkRequest.reviewNote}` : '.'} Please contact the admission cell.
            </p>
          )}
        </section>
      ) : null}

      {s.workspace && stage ? (
        <div className="panel mb-4">
          <div className="stat-row">
            <div className="stat"><div className="num">{stageIndex(stage)}/{STAGES.length}</div><div className="lbl">{STAGE_LABEL[stage]}</div></div>
            <div className="stat completed"><div className="num">{docsReady}/{s.documents.length}</div><div className="lbl">Documents ready</div></div>
            <div className="stat in_progress"><div className="num">{s.preferences.length}</div><div className="lbl">Preferences saved</div></div>
            <div className="stat"><div className="num">{s.notifications.filter((n) => !n.isRead).length}</div><div className="lbl">New notifications</div></div>
          </div>
          <div className="mt-3">
            <SegBar statuses={STAGES.map((st) => (stageIndex(st) < stageIndex(stage) ? 'completed' : st === stage ? 'in_progress' : 'pending'))} />
          </div>
        </div>
      ) : null}

      {actions.length > 0 ? (
        <section className="panel mb-4" aria-labelledby="todo">
          <h2 className="panel-title" id="todo">Pending actions</h2>
          <ul className="review-history mb-0">
            {actions.map((a) => (
              <li key={a.id}>{a.href ? <Link href={a.href}>{a.text}</Link> : a.text}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="row g-4 mb-4">
        {s.record ? (
          <div className="col-lg-6">
            <section className="panel h-100" aria-labelledby="rec" data-testid="cap-record">
              <h2 className="panel-title" id="rec">Your CAP record</h2>
              <dl className="cap-summary mt-3">
                <dt>Candidate name</dt><dd data-testid="record-name">{s.record.candidate_name}</dd>
                <dt>Category</dt><dd>{s.record.category ?? 'Not recorded'}</dd>
                {s.record.merit_rank ? (
                  <>
                    <dt>Merit rank {s.record.is_synthetic ? '(fictional)' : ''}</dt>
                    <dd>{s.record.merit_rank}{s.record.percentile != null ? ` (percentile ${Number(s.record.percentile).toFixed(4)})` : ''}</dd>
                  </>
                ) : null}
                <dt>Application status</dt><dd><StatusPill status={s.record.application_status} label={LABELS[s.record.application_status]} /></dd>
                <dt>Record verification</dt><dd><StatusPill status={s.record.verification_status} label={LABELS[s.record.verification_status]} /></dd>
                <dt>CAP round</dt><dd>{s.record.cap_round ? `Round ${s.record.cap_round}` : 'Not recorded'}</dd>
                <dt>Allotment (as recorded here)</dt>
                <dd>
                  <StatusPill status={s.record.allotment_status} label={LABELS[s.record.allotment_status]} />
                  {s.record.course ? (
                    <div className="mt-1">
                      {s.record.course.college_name}, {s.record.course.city}
                      <div className="text-muted small">{s.record.course.branch}{s.record.allotted_pref_no ? ` (your preference no. ${s.record.allotted_pref_no})` : ''}</div>
                    </div>
                  ) : null}
                </dd>
              </dl>
              <p className="small text-muted mb-0">These entries are kept by this demonstration system. They are not an official CET Cell decision.</p>
            </section>
          </div>
        ) : null}
        <div className={s.record ? 'col-lg-6' : 'col-12'}>
          <NotificationsPanel notes={s.notifications} />
        </div>
      </div>

      {s.workspace && stage ? (
        <div className="row g-4 mb-4">
          <div className="col-lg-6">
            <section className="panel h-100" aria-labelledby="track">
              <h2 className="panel-title" id="track">Admission progress</h2>
              <ol className="stage-track mt-2">
                {STAGES.map((st, i) => {
                  const cls = stageIndex(st) < stageIndex(stage) ? 'done' : st === stage ? 'current' : '';
                  return (
                    <li key={st} className={cls}>
                      <span className="stage-dot">{cls === 'done' ? '✓' : i + 1}</span>
                      <span className="stage-name">{STAGE_LABEL[st]}</span>
                    </li>
                  );
                })}
              </ol>
              {s.events.length > 0 ? (
                <>
                  <h3 className="h6 mt-3">Status history</h3>
                  <ul className="review-history">
                    {[...s.events].reverse().slice(0, 6).map((e) => (
                      <li key={e.id}>
                        {STAGE_LABEL[e.toStage as keyof typeof STAGE_LABEL] ?? e.toStage}
                        {e.note ? <span className="text-muted"> - {e.note}</span> : null}
                        <div className="text-muted small">{formatDay(e.createdAt)}</div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          </div>
          <div className="col-lg-6">
            <section className="panel h-100" aria-labelledby="deadlines">
              <h2 className="panel-title" id="deadlines">Demo schedule</h2>
              <p className="small text-muted">Dates configured by the admission cell for this demonstration. They are not official CET Cell dates.</p>
              {s.rounds.length === 0 ? (
                <p className="text-muted mb-0">No dates configured.</p>
              ) : (
                <ul className="review-history">
                  {s.rounds.map((r) => (
                    <li key={r.round}>
                      <strong>{r.label}</strong>
                      <div className="text-muted small">Allotment: {formatDay(r.allotmentDate) || 'not set'} · Reporting by: {formatDay(r.reportingDeadline) || 'not set'}</div>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="h6 mt-3">Your appointments</h3>
              {upcoming.length === 0 ? (
                <p className="text-muted mb-0">None scheduled.</p>
              ) : (
                <ul className="review-history mb-0">
                  {upcoming.map((a) => (
                    <li key={a.id}>
                      <strong>{formatDay(a.date)}, {formatClock(a.slotMinutes)}</strong>
                      <div className="text-muted small">{a.purpose}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {s.workspace ? (
        <div className="row g-4 mb-4">
          <div className="col-lg-6">
            <section className="panel h-100" aria-labelledby="prefs">
              <div className="d-flex justify-content-between align-items-baseline">
                <h2 className="panel-title" id="prefs">Your preferences</h2>
                <Link href="/preferences" className="small">Edit</Link>
              </div>
              {s.preferences.length === 0 ? (
                <p className="text-muted mb-0">No preferences saved yet.</p>
              ) : (
                <ol className="ps-3 mb-0" data-testid="pref-list">
                  {s.preferences.map((p) => (
                    <li key={p.position} className="mb-1">{p.course.college_name} <span className="text-muted">- {p.course.branch}</span></li>
                  ))}
                </ol>
              )}
            </section>
          </div>
          <div className="col-lg-6">
            <section className="panel h-100" aria-labelledby="docs">
              <div className="d-flex justify-content-between align-items-baseline">
                <h2 className="panel-title" id="docs">Document checklist</h2>
                <Link href="/checklist" className="small">Open</Link>
              </div>
              <SegBar statuses={s.documents.map((d) => (d.status === 'ready' || d.status === 'verified' ? 'completed' : d.status === 'in_progress' ? 'in_progress' : 'pending'))} />
              <ul className="review-history mt-2 mb-0">
                {s.documents.slice(0, 8).map((d) => (
                  <li key={d.code} className="d-flex justify-content-between gap-2">
                    <span>{d.title}</span>
                    <StatusPill status={d.status} label={DOC_STATUS_LABEL[d.status]} />
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : null}

      {s.history.length > 0 ? (
        <section className="panel mb-4" aria-labelledby="hist">
          <h2 className="panel-title" id="hist">CAP round history</h2>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead><tr><th>Round</th><th>Event</th><th>College and course</th><th>Pref. no.</th><th>Note</th></tr></thead>
              <tbody>
                {s.history.map((h) => (
                  <tr key={h.id}>
                    <td>Round {h.capRound}</td>
                    <td>{EVENT_LABEL[h.eventType] ?? h.eventType}</td>
                    <td>{h.course ? `${h.course.college_name} - ${h.course.branch}` : '-'}</td>
                    <td>{h.prefNo ?? '-'}</td>
                    <td className="text-muted">{h.remark ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="manual-note">
        <strong>Reminder:</strong> your original documents are verified in person at the college. AdmitQueue records the checklist and status only; it cannot check whether a document is genuine.
      </p>
    </>
  );
}
