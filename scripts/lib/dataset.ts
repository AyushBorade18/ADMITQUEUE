// Deterministic generator for the fictional demo data. No real student, college or merit-list data is used.
// The same seed always produces the same 500 candidates, so the seed script can be run again safely.

export const DEMO_PREFIX = 'DM26';
export const DEMO_COUNT = 500;

/** mulberry32: small, fast, deterministic PRNG. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Aarav', 'Vihaan', 'Aditya', 'Arjun', 'Ishaan', 'Kabir', 'Reyansh', 'Sai', 'Rohan', 'Yash', 'Ananya', 'Diya', 'Isha', 'Kavya', 'Meera', 'Nisha', 'Priya', 'Riya', 'Saanvi', 'Tara', 'Neel', 'Om', 'Pranav', 'Siddharth', 'Tanvi', 'Uma', 'Veda', 'Zoya', 'Dev', 'Harsh'];
const LAST = ['Kulkarni', 'Patil', 'Deshmukh', 'Joshi', 'Pawar', 'Shinde', 'Gaikwad', 'More', 'Jadhav', 'Bhosale', 'Kale', 'Naik', 'Sawant', 'Chavan', 'Thakur', 'Mehta', 'Rao', 'Iyer', 'Nair', 'Khan', 'Shaikh', 'Verma', 'Gupta', 'Das', 'Bose', 'Menon', 'Reddy', 'Singh', 'Pillai', 'Wagh'];
const CATEGORIES = ['OPEN', 'OBC', 'SC', 'ST', 'EWS', 'VJ/NT'];

// Clearly fictional institutions (the "(Demo)" suffix is part of the name on purpose).
const COLLEGES: [string, string][] = [
  ['Riverbend Institute of Technology (Demo)', 'Riverbend'],
  ['Northfield College of Engineering (Demo)', 'Northfield'],
  ['Lakeside Technical University (Demo)', 'Lakeside'],
  ['Hillcrest Engineering Academy (Demo)', 'Hillcrest'],
  ['Meadowbrook Institute of Science (Demo)', 'Meadowbrook'],
  ['Stonebridge College of Technology (Demo)', 'Stonebridge'],
  ['Cedarwood Institute of Engineering (Demo)', 'Cedarwood'],
  ['Silverleaf Polytechnic University (Demo)', 'Silverleaf'],
  ['Oakridge School of Engineering (Demo)', 'Oakridge'],
  ['Brightwater Institute of Technology (Demo)', 'Brightwater'],
];
const BRANCHES: [string, string, number][] = [
  ['Computer Engineering', 'CE', 40],
  ['Information Technology', 'IT', 30],
  ['Electronics and Telecommunication', 'EN', 30],
  ['Mechanical Engineering', 'ME', 30],
];

export type DemoCourse = { code: string; college_name: string; city: string; branch: string; demo_seats: number };
export type DemoStudent = {
  index: number; // 1-based, also the engine student id
  capId: string;
  name: string;
  category: string;
  rank: number;
  percentile: number;
  verified: boolean;
  prefIndexes: number[]; // 1-based indexes into the course list
};

export function buildCourses(): DemoCourse[] {
  const out: DemoCourse[] = [];
  COLLEGES.forEach(([name, city], ci) => {
    BRANCHES.forEach(([branch, short, seats], bi) => {
      // seat counts vary a little per college so the demo is not perfectly uniform
      const delta = ((ci * 7 + bi * 3) % 4) * 5 - 5;
      out.push({ code: `DEMO-${String(ci + 1).padStart(2, '0')}-${short}`, college_name: name, city, branch, demo_seats: Math.max(10, seats + delta) });
    });
  });
  return out;
}

export function capIdFor(index: number): string {
  return `${DEMO_PREFIX}${String(index).padStart(6, '0')}`;
}

export function buildStudents(courseCount: number, count = DEMO_COUNT, seed = 20260101): DemoStudent[] {
  const rng = makeRng(seed);
  const used = new Set<string>();
  const out: DemoStudent[] = [];
  for (let i = 1; i <= count; i++) {
    let name = '';
    do {
      name = `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`;
    } while (used.has(name) && used.size < FIRST.length * LAST.length);
    used.add(name);
    const prefCount = 5 + Math.floor(rng() * 6);
    const picks = new Set<number>();
    // popular courses (low indexes) are slightly more likely so the simulation has some competition
    while (picks.size < prefCount) picks.add(1 + Math.floor(Math.pow(rng(), 1.3) * courseCount));
    out.push({
      index: i,
      capId: capIdFor(i),
      name,
      category: CATEGORIES[Math.floor(rng() * CATEGORIES.length)],
      rank: i, // index order is merit order
      percentile: Math.round((100 - ((i - 1) / count) * 62 - rng() * 0.05) * 1e7) / 1e7,
      verified: rng() < 0.92,
      prefIndexes: [...picks],
    });
  }
  return out;
}

export const STAGE_PATH = ['registration', 'profile_verification', 'preference_preparation', 'allotment_recorded'] as const;
