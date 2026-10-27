import { AllotmentRunner } from '@/components/AdminTools';

export const metadata = { title: 'Allotment demo' };

export default function AllotmentPage() {
  return (
    <>
      <h1 className="page-title">Allotment simulation</h1>
      <section className="panel">
        <p className="text-muted">Sorts the students by merit rank (bubble sort) and gives each one the first course on their preference list that still has a free seat; students without a seat go to a waiting queue. The steps are in <code>cpp/engine/main.cpp</code>. It is a classroom demonstration, <strong>not</strong> the official CET Cell allotment.</p>
        <AllotmentRunner />
      </section>
    </>
  );
}
