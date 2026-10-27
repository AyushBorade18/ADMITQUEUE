import Link from 'next/link';
import { PublicBar } from '@/components/PublicBar';
import { STAGES, STAGE_LABEL } from '@/lib/stages';

const STAGE_TEXT: Record<string, string> = {
  registration: 'Your CAP Application ID opens your own workspace.',
  profile_verification: 'Your saved CAP record is verified and linked to your account.',
  preference_preparation: 'Build and save your ordered college and course preference list.',
  allotment_recorded: 'Your allotment, as recorded by the admission cell, appears here.',
  acceptance_reporting: 'Track acceptance, reporting and document verification.',
  next_round_consideration: 'If a later round applies, your next steps are shown here.',
  admission_completed: 'Your admission is marked complete by college staff.',
};

export default function Home() {
  return (
    <>
      <PublicBar />
      <main className="container" id="main">
        <section className="hero">
          <h1>From CAP allotment to confirmed admission, step by step.</h1>
          <p className="lead mt-3">
            Log in with your CAP Application ID and your saved details load automatically: your record, preferences, document checklist and admission status. Your original
            documents are still verified in person at the college. AdmitQueue tracks where you stand.
          </p>
          <div className="d-flex flex-wrap gap-2 mt-4">
            <Link className="btn btn-primary btn-lg" href="/login">
              Log in
            </Link>
          </div>
        </section>

        <section className="panel mb-4">
          <h2 className="panel-title">What you will follow</h2>
          <p className="text-muted">Seven stages take you from your first login to a completed admission.</p>
          <ol className="flow-list">
            {STAGES.map((s, i) => (
              <li key={s}>
                <span className="step-no">{i + 1}</span>
                <div>
                  <strong>{STAGE_LABEL[s]}</strong>
                  <div className="text-muted">{STAGE_TEXT[s]}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="manual-note mb-5">
          <strong>Please note:</strong> AdmitQueue is an independent project. It is not connected to the CET Cell or the official CAP portal and cannot fetch records from there. Details shown
          come from this system&apos;s own database, and demonstration records are labelled as fictional.
        </section>
      </main>
      <footer className="container py-4 text-center small text-muted">
        College staff: <Link href="/admin/login">admin log in</Link>
      </footer>
    </>
  );
}
