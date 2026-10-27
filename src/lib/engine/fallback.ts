// TypeScript copy of cpp/engine/main.cpp. It reads the same request text and prints the same answer lines.
// It is only used when the C++ program has not been built / cannot start on the machine (the dashboard and
// /api/health/engine tell which one is active). A unit test checks that both give identical answers.

type Tokens = { next: () => string; num: () => number };

function tokens(input: string): Tokens {
  const list = input.split(/\s+/).filter(Boolean);
  let i = 0;
  return {
    next: () => list[i++] ?? '',
    num: () => Number(list[i++] ?? 0),
  };
}

const MAX = 5000;

export function runFallback(input: string): string[] {
  const t = tokens(input);
  const op = t.next();
  const out: string[] = [];
  const tooMany = () => ['ERROR too_many'];

  if (op === 'health') return ['ENGINE typescript-fallback', 'SELFCHECK 1'];

  if (op === 'search') {
    const mode = t.next();
    const query = t.next();
    const n = t.num();
    if (n < 0 || n > MAX) return tooMany();
    const hits: number[] = [];
    for (let i = 0; i < n; i++) {
      const id = t.next();
      const name = t.next();
      const hit = mode === 'prefix' ? id.startsWith(query) : name.includes(query);
      if (hit) hits.push(i);
    }
    out.push(`STATS ${n} ${n}`);
    for (const h of hits) out.push(`MATCH ${h}`);
    return out;
  }

  if (op === 'import_check') {
    const e = t.num();
    if (e < 0 || e > MAX * 4) return tooMany();
    const old = new Set<string>();
    for (let i = 0; i < e; i++) old.add(t.next());
    const m = t.num();
    if (m < 0 || m > MAX) return tooMany();
    const seen = new Set<string>();
    for (let i = 0; i < m; i++) {
      const id = t.next();
      out.push(old.has(id) ? 'already_exists' : seen.has(id) ? 'duplicate_in_file' : 'new');
      seen.add(id);
    }
    return out;
  }

  if (op === 'sort_desc') {
    const n = t.num();
    if (n < 0 || n > MAX) return tooMany();
    const rows: { id: number; score: number }[] = [];
    for (let i = 0; i < n; i++) rows.push({ id: t.num(), score: t.num() });
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < n - 1 - i; j++)
        if (rows[j].score < rows[j + 1].score) [rows[j], rows[j + 1]] = [rows[j + 1], rows[j]];
    return rows.map((r) => `ID ${r.id}`);
  }

  if (op === 'undo_top') {
    const n = t.num();
    if (n < 0 || n > MAX) return tooMany();
    let top = 0;
    for (let i = 0; i < n; i++) top = t.num();
    return [`TOP ${n > 0 ? top : 0}`];
  }

  if (op === 'next_call') {
    const fairness = t.num();
    let streak = t.num();
    const n = t.num();
    if (n < 0 || n > MAX) return tooMany();
    const priority: { level: number; seq: number }[] = [];
    const regular: number[] = [];
    for (let i = 0; i < n; i++) {
      const seq = t.num();
      const level = t.num();
      if (level >= 3) regular.push(seq);
      else priority.push({ level, seq });
    }
    priority.sort((a, b) => a.level - b.level || a.seq - b.seq);
    let chosen = 0;
    if (priority.length > 0 && !(streak >= fairness && regular.length > 0)) {
      chosen = priority[0].seq;
      streak++;
    } else if (regular.length > 0) {
      chosen = regular[0];
      streak = 0;
    }
    return [`NEXT ${chosen} ${streak}`];
  }

  if (op === 'allot') {
    t.num(); // round (not needed by the steps below)
    const c = t.num();
    if (c < 0 || c > 300) return ['ERROR too_many_courses'];
    const courses: { id: number; seats: number; filled: number }[] = [];
    for (let i = 0; i < c; i++) courses.push({ id: t.num(), seats: t.num(), filled: t.num() });
    const s = t.num();
    if (s < 0 || s > MAX) return tooMany();
    const st: { id: number; rank: number; status: number; course: number; prefNo: number; verified: number; prefs: number[] }[] = [];
    for (let i = 0; i < s; i++) {
      const id = t.num(), rank = t.num(), status = t.num(), course = t.num(), prefNo = t.num(), verified = t.num(), np = t.num();
      if (np < 0 || np > 30) return ['ERROR too_many_preferences'];
      const prefs: number[] = [];
      for (let p = 0; p < np; p++) prefs.push(t.num());
      st.push({ id, rank, status, course, prefNo, verified, prefs });
    }
    const idx = (id: number) => courses.findIndex((x) => x.id === id);
    const order = st.map((_, i) => i);
    for (let i = 0; i < s - 1; i++)
      for (let j = 0; j < s - 1 - i; j++)
        if (st[order[j]].rank > st[order[j + 1]].rank) [order[j], order[j + 1]] = [order[j + 1], order[j]];
    const waiting: number[] = [];
    for (const k of order) {
      const x = st[k];
      if (x.status === 3 || x.status === 4) continue;
      if (!x.verified) continue;
      const limit = x.status === 1 ? x.prefNo - 1 : x.prefs.length;
      let got = -1;
      let gotCourse = -1;
      for (let p = 0; p < limit; p++) {
        const ci = idx(x.prefs[p]);
        if (ci >= 0 && courses[ci].filled < courses[ci].seats) {
          got = p;
          gotCourse = ci;
          break;
        }
      }
      if (got >= 0) {
        if (x.status === 1) {
          const old = idx(x.course);
          if (old >= 0) courses[old].filled--;
        }
        courses[gotCourse].filled++;
        x.status = 1;
        x.course = x.prefs[got];
        x.prefNo = got + 1;
      } else if (x.status !== 1) {
        x.status = 2;
        x.course = 0;
        x.prefNo = 0;
        waiting.push(x.id);
      }
    }
    for (const x of st) out.push(`STUDENT ${x.id} ${x.status} ${x.course} ${x.prefNo}`);
    for (const x of courses) out.push(`COURSE ${x.id} ${x.filled} ${x.seats}`);
    for (const w of waiting) out.push(`WAIT ${w}`);
    return out;
  }

  if (op === 'load') {
    const rows = t.num(), cols = t.num(), from = t.num(), to = t.num(), b = t.num();
    if (rows < 1 || rows > 40 || cols < 1 || cols > 100 || from < 0 || to >= cols || from > to) return ['ERROR bad_size'];
    const grid = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
    for (let i = 0; i < b; i++) {
      const r = t.num(), k = t.num();
      if (r >= 0 && r < rows && k >= 0 && k < cols) grid[r][k]++;
    }
    let used = 0;
    for (let r = 0; r < rows; r++) {
      let sum = 0;
      for (let k = 0; k < cols; k++) {
        sum += grid[r][k];
        if (grid[r][k] > 0) used++;
      }
      out.push(`ROWSUM ${r} ${sum}`);
    }
    const taken = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
    for (let round = 0; round < 3; round++) {
      let br = -1, bk = -1;
      for (let r = 0; r < rows; r++)
        for (let k = from; k <= to; k++)
          if (!taken[r][k] && (br === -1 || grid[r][k] < grid[br][bk])) {
            br = r;
            bk = k;
          }
      if (br === -1) break;
      taken[br][bk] = true;
      out.push(`BEST ${br} ${bk} ${grid[br][bk]}`);
    }
    out.push(`BOOKED ${used}`);
    return out;
  }

  if (op === 'readiness') {
    const docs = t.num(), rounds = t.num();
    if (docs < 1 || docs > 40 || rounds < 1 || rounds > 12) return ['ERROR bad_size'];
    const total: number[] = [];
    for (let r = 0; r < rounds; r++) total.push(t.num());
    const cnt = Array.from({ length: docs }, () => new Array<number>(rounds).fill(0));
    const k = t.num();
    for (let i = 0; i < k; i++) {
      const d = t.num(), r = t.num(), n = t.num();
      if (d >= 0 && d < docs && r >= 0 && r < rounds) cnt[d][r] += n;
    }
    let weakest = 0;
    let weakestSum = -1;
    for (let d = 0; d < docs; d++) {
      let sum = 0;
      for (let r = 0; r < rounds; r++) {
        sum += cnt[d][r];
        let percent = total[r] > 0 ? Math.trunc((cnt[d][r] * 100) / total[r]) : 0;
        if (percent > 100) percent = 100;
        out.push(`PCT ${d} ${r} ${percent}`);
      }
      if (weakestSum === -1 || sum < weakestSum) {
        weakestSum = sum;
        weakest = d;
      }
    }
    out.push(`WEAKEST ${weakest}`);
    return out;
  }

  return [`ERROR unknown_op ${op}`];
}
