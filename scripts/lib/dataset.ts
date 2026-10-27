// Deterministic generator for the fictional demo data. No real student, college or merit-list data is used.
// The same seed always produces the same 500 candidates, so the seed script can be run again safely.

<<<<<<< HEAD
// Same shape as real application IDs (2 letters + 2-digit year + 6 digits, e.g. EN24133045) but year 26 and
// all numbers are invented. Names/numbers are NOT taken from any real list.
export const DEMO_PREFIX = 'EN26';
=======
export const DEMO_PREFIX = 'DM26';
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
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

<<<<<<< HEAD
const FIRST_M = ['AARAV', 'VIHAAN', 'ADITYA', 'ARJUN', 'ISHAAN', 'KABIR', 'REYANSH', 'SAI', 'ROHAN', 'YASH', 'PRANAV', 'SIDDHARTH', 'OM', 'HARSH', 'ATHARV', 'SHREYAS', 'ONKAR', 'TEJAS', 'OMKAR', 'PRATHAMESH', 'ANIKET', 'SWAPNIL', 'AMEY', 'DHRUV', 'KARTIK', 'MAYUR', 'NIKHIL', 'RUSHIKESH', 'SAURABH', 'VEDANT'];
const FIRST_F = ['ANANYA', 'DIYA', 'ISHA', 'KAVYA', 'MEERA', 'NISHA', 'PRIYA', 'RIYA', 'SAANVI', 'TARA', 'TANVI', 'UMA', 'VEDA', 'ZOYA', 'SAMRUDDHI', 'PRERANA', 'SHRAVANI', 'AISHWARYA', 'GAYATRI', 'PRAJAKTA', 'RUTUJA', 'SNEHAL', 'VAISHNAVI', 'APURVA', 'MRUNMAYEE', 'SAKSHI', 'TANMAYI', 'ADITI', 'POOJA', 'SHRUTI'];
const FATHER = ['SUNIL', 'SACHIN', 'RAJESH', 'SANJAY', 'MILIND', 'ANIL', 'VIJAY', 'PRAKASH', 'DINESH', 'SURESH', 'MAHESH', 'RAVINDRA', 'ASHOK', 'NITIN', 'PRASAD', 'SUDHAKAR', 'DILIP', 'RAMESH', 'SANTOSH', 'AMOL', 'VINAY', 'MANOJ', 'YOGESH', 'SHRIKANT', 'HEMANT'];
const LAST = ['KULKARNI', 'PATIL', 'DESHMUKH', 'JOSHI', 'PAWAR', 'SHINDE', 'GAIKWAD', 'MORE', 'JADHAV', 'BHOSALE', 'KALE', 'NAIK', 'SAWANT', 'CHAVAN', 'THAKUR', 'MEHTA', 'RAO', 'IYER', 'NAIR', 'KHAN', 'SHAIKH', 'VERMA', 'GUPTA', 'DAS', 'BOSE', 'MENON', 'REDDY', 'SINGH', 'PILLAI', 'WAGH', 'DIWAN', 'SHAH', 'AGARWAL', 'LONDHE', 'KADAM', 'GHARAT', 'DHAMAL', 'BORADE', 'TAMBE', 'ZENDE'];
// category mix roughly like a real merit list (weights add up to 100)
const CATEGORIES: [string, number][] = [['Open', 40], ['OBC', 17], ['SEBC', 9], ['EWS', 9], ['SC', 8], ['NT 3 (NT-D)', 4], ['VJ (VJ-A)', 3], ['NT 1 (NT-B)', 3], ['ST', 3], ['NT 2 (NT-C)', 2], ['SBC', 2]];

function pickCategory(r: number): string {
  let acc = 0;
  for (const [name, w] of CATEGORIES) {
    acc += w;
    if (r * 100 < acc) return name;
  }
  return 'Open';
}
=======
const FIRST = ['Aarav', 'Vihaan', 'Aditya', 'Arjun', 'Ishaan', 'Kabir', 'Reyansh', 'Sai', 'Rohan', 'Yash', 'Ananya', 'Diya', 'Isha', 'Kavya', 'Meera', 'Nisha', 'Priya', 'Riya', 'Saanvi', 'Tara', 'Neel', 'Om', 'Pranav', 'Siddharth', 'Tanvi', 'Uma', 'Veda', 'Zoya', 'Dev', 'Harsh'];
const LAST = ['Kulkarni', 'Patil', 'Deshmukh', 'Joshi', 'Pawar', 'Shinde', 'Gaikwad', 'More', 'Jadhav', 'Bhosale', 'Kale', 'Naik', 'Sawant', 'Chavan', 'Thakur', 'Mehta', 'Rao', 'Iyer', 'Nair', 'Khan', 'Shaikh', 'Verma', 'Gupta', 'Das', 'Bose', 'Menon', 'Reddy', 'Singh', 'Pillai', 'Wagh'];
const CATEGORIES = ['OPEN', 'OBC', 'SC', 'ST', 'EWS', 'VJ/NT'];
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52

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
<<<<<<< HEAD
  return `${DEMO_PREFIX}${String(100000 + index)}`;
=======
  return `${DEMO_PREFIX}${String(index).padStart(6, '0')}`;
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
}

export function buildStudents(courseCount: number, count = DEMO_COUNT, seed = 20260101): DemoStudent[] {
  const rng = makeRng(seed);
  const used = new Set<string>();
  const out: DemoStudent[] = [];
  for (let i = 1; i <= count; i++) {
    let name = '';
    do {
<<<<<<< HEAD
      // merit-list style: SURNAME FIRSTNAME FATHERNAME
      const first = rng() < 0.5 ? FIRST_M : FIRST_F;
      name = `${LAST[Math.floor(rng() * LAST.length)]} ${first[Math.floor(rng() * first.length)]} ${FATHER[Math.floor(rng() * FATHER.length)]}`;
    } while (used.has(name));
=======
      name = `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`;
    } while (used.has(name) && used.size < FIRST.length * LAST.length);
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
    used.add(name);
    const prefCount = 5 + Math.floor(rng() * 6);
    const picks = new Set<number>();
    // popular courses (low indexes) are slightly more likely so the simulation has some competition
    while (picks.size < prefCount) picks.add(1 + Math.floor(Math.pow(rng(), 1.3) * courseCount));
    out.push({
      index: i,
      capId: capIdFor(i),
      name,
<<<<<<< HEAD
      category: pickCategory(rng()),
      rank: i, // index order is merit order
      // top of a real list is 99.9+; strictly decreasing with rank (step 0.0016 > noise 0.0005)
      percentile: Math.round((100 - (i - 1) * 0.0016 - rng() * 0.0005) * 1e7) / 1e7,
=======
      category: CATEGORIES[Math.floor(rng() * CATEGORIES.length)],
      rank: i, // index order is merit order
      percentile: Math.round((100 - ((i - 1) / count) * 62 - rng() * 0.05) * 1e7) / 1e7,
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
      verified: rng() < 0.92,
      prefIndexes: [...picks],
    });
  }
  return out;
}

export const STAGE_PATH = ['registration', 'profile_verification', 'preference_preparation', 'allotment_recorded'] as const;
<<<<<<< HEAD

// ---- demo logins -------------------------------------------------------------------------------------------
// Every demo student logs in with the CAP ID and, as password, the same CAP ID (see demo-data/dummy_students_500.csv).
export const passwordFor = (capId: string): string => capId;
// Internal sign-in address used only by Supabase Auth. Nobody receives mail there (no mail is ever sent).
export const emailFor = (capId: string): string => `${capId.toLowerCase()}@students.example.com`;
export const titleName = (name: string): string => name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

// Fixed admin for the demo. This is a dummy account: the credentials are public in the README on purpose.
export const DEMO_ADMIN = { loginId: 'admin', password: 'Admin@123', email: 'admin@admitqueue.example.com', fullName: 'Admission Cell Admin' };
=======
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
