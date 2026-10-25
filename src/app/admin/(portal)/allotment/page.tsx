import { AllotmentRunner } from '@/components/AdminTools';

export const metadata = { title: 'Allotment demo' };

export default function AllotmentPage() {
  return (
    <>
      <h1 className="page-title">Allotment simulation</h1>
      <section className="panel">
        <p className="text-muted">Runs the C++ allotment simulator (linked list of students, FIFO queues, bubble sort by merit, seat matrix) on the records and preferences stored in this system. It is a classroom demonstration of the data structures, <strong>not</strong> the official CET Cell allotment.</p>
        <AllotmentRunner />
      </section>
    </>
  );
}
