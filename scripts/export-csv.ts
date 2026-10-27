// Writes the 500 fictional demo students to demo-data/dummy_students_500.csv (no database needed).
//   npm run db:csv
// The first five columns are in the order the admin "Import CSV" page expects (cap_id,name,category,merit_rank,percentile),
// so the same file can be imported there. Extra columns are ignored by the importer.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildCourses, buildStudents, passwordFor } from './lib/dataset';

const courses = buildCourses();
const students = buildStudents(courses.length);
const lines = ['cap_id,name,category,merit_rank,percentile,password,documents_verified,preferences'];
for (const s of students) {
  const prefs = s.prefIndexes.map((i) => courses[i - 1].code).join(' ');
  lines.push([s.capId, s.name, s.category, s.rank, s.percentile.toFixed(7), passwordFor(s.capId), s.verified ? 'yes' : 'no', prefs].join(','));
}
const dir = path.join(process.cwd(), 'demo-data');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'dummy_students_500.csv');
writeFileSync(file, lines.join('\n') + '\n');
console.log(`Wrote ${students.length} rows to ${file}`);
