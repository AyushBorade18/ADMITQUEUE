import { describe, expect, it } from 'vitest';
import { isValidCapId, normalizeCapId, parseAdminLoginId, parseCapId } from '../../src/lib/capId';
<<<<<<< HEAD
import { existsSync } from 'node:fs';
import { EngineError, resolveEnginePath, runCpp } from '../../src/lib/engine/client';
import { runFallback } from '../../src/lib/engine/fallback';
import { engine } from '../../src/lib/engine/ops';
import { DEMO_ADMIN, buildCourses, buildStudents, capIdFor, emailFor, passwordFor } from '../../scripts/lib/dataset';
import { adminLoginSchema, loginSchema } from '../../src/lib/auth/schemas';

describe('CAP ID normalization', () => {
  it('accepts any style and returns one canonical form', () => {
    for (const v of ['en26100001', ' EN26 100001 ', 'en26-100001', 'EN26.100001', 'ＥＮ26100001']) expect(parseCapId(v)).toBe('EN26100001');
=======
import { EngineError, runEngine } from '../../src/lib/engine/client';
import { engine } from '../../src/lib/engine/ops';
import { buildCourses, buildStudents } from '../../scripts/lib/dataset';
import { loginSchema, registerSchema } from '../../src/lib/auth/schemas';

describe('CAP ID normalization', () => {
  it('accepts any style and returns one canonical form', () => {
    for (const v of ['dm26000001', ' DM26 000001 ', 'dm26-000001', 'DM26.000001', 'ＤＭ26000001']) expect(parseCapId(v)).toBe('DM26000001');
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
  });
  it('rejects too short, too long, empty and non-strings', () => {
    expect(parseCapId('abc')).toBeNull();
    expect(parseCapId('A'.repeat(21))).toBeNull();
    expect(parseCapId('   ')).toBeNull();
    expect(parseCapId(null)).toBeNull();
<<<<<<< HEAD
    expect(parseCapId({ toString: () => 'EN26100001' })).toBeNull();
    expect(parseCapId('x'.repeat(100))).toBeNull();
  });
  it('strips characters that could be used for injection', () => {
    expect(normalizeCapId("EN26'; drop table--")).toBe('EN26DROPTABLE');
=======
    expect(parseCapId({ toString: () => 'DM26000001' })).toBeNull();
    expect(parseCapId('x'.repeat(100))).toBeNull();
  });
  it('strips characters that could be used for injection', () => {
    expect(normalizeCapId("DM26'; drop table--")).toBe('DM26DROPTABLE');
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
    expect(isValidCapId(normalizeCapId('1 OR 1=1'))).toBe(false);
  });
  it('admin login ids are lower-case short names', () => {
    expect(parseAdminLoginId(' Admin ')).toBe('admin');
    expect(parseAdminLoginId('a')).toBeNull();
    expect(parseAdminLoginId('bad id')).toBeNull();
  });
});

describe('input schemas', () => {
  it('login needs both fields', () => {
<<<<<<< HEAD
    expect(loginSchema.safeParse({ capId: 'EN26100001', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ capId: 'EN26100001', password: 'x' }).success).toBe(true);
  });
  it('admin login accepts the demo admin', () => {
    expect(adminLoginSchema.safeParse({ loginId: DEMO_ADMIN.loginId, password: DEMO_ADMIN.password }).success).toBe(true);
=======
    expect(loginSchema.safeParse({ capId: 'DM26000001', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ capId: 'DM26000001', password: 'x' }).success).toBe(true);
  });
  it('registration enforces password rules and matching confirmation', () => {
    const base = { fullName: 'A B', email: 'A@Example.com', capId: 'DM26000001', password: 'abcdefg1', confirmPassword: 'abcdefg1' };
    const ok = registerSchema.safeParse(base);
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.email).toBe('a@example.com');
    expect(registerSchema.safeParse({ ...base, password: 'abcdefgh', confirmPassword: 'abcdefgh' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, confirmPassword: 'other123' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, email: 'nope' }).success).toBe(false);
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
  });
});

describe('demo dataset', () => {
  it('is deterministic, has 500 unique fictional candidates and valid preferences', () => {
    const a = buildStudents(buildCourses().length);
    const b = buildStudents(buildCourses().length);
    expect(a).toEqual(b);
    expect(a).toHaveLength(500);
    expect(new Set(a.map((s) => s.capId)).size).toBe(500);
<<<<<<< HEAD
    expect(new Set(a.map((s) => s.name)).size).toBe(500);
    expect(a[0].capId).toBe('EN26100001');
    expect(a[499].capId).toBe('EN26100500');
=======
    expect(a[0].capId).toBe('DM26000001');
    expect(a[499].capId).toBe('DM26000500');
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
    for (const s of a) {
      expect(isValidCapId(s.capId)).toBe(true);
      expect(new Set(s.prefIndexes).size).toBe(s.prefIndexes.length);
      expect(s.prefIndexes.length).toBeGreaterThanOrEqual(5);
      expect(s.prefIndexes.length).toBeLessThanOrEqual(10);
      expect(s.percentile).toBeLessThanOrEqual(100);
    }
  });
  it('contains no real institution names (every college is marked as a demo)', () => {
    for (const c of buildCourses()) expect(c.college_name).toContain('(Demo)');
  });
<<<<<<< HEAD
  it('demo login: password is the CAP ID and the sign-in address is derived from it', () => {
    expect(passwordFor(capIdFor(7))).toBe('EN26100007');
    expect(emailFor('EN26100007')).toBe('en26100007@students.example.com');
  });
});

describe('engine (C++ program, or the TypeScript copy when it is not built)', () => {
  it('health reports a passing self check', async () => {
    const h = await engine.health();
    expect(h.selfCheck).toBe(true);
    expect(['cpp', 'typescript']).toContain(h.mode);
  });
  it('import check classifies new / repeated / existing IDs', async () => {
    const r = await engine.importCheck(['A00001'], ['A00001', 'B00002', 'B00002', 'C00003']);
    expect(r.status).toEqual(['already_exists', 'new', 'duplicate_in_file', 'new']);
  });
  it('bubble sort ranks highest score first and keeps the order of equal scores', async () => {
    expect(await engine.rankByScore([{ id: 1, score: 5 }, { id: 2, score: 9 }, { id: 3, score: 9 }, { id: 4, score: 1 }])).toEqual([2, 3, 1, 4]);
  });
  it('stack: the newest action is on top', async () => {
    expect(await engine.undoTop([4, 9, 12])).toBe(12);
    expect(await engine.undoTop([])).toBeNull();
  });
  it('service desk: priority first, but the fairness rule calls a regular student after 3 priority calls', async () => {
    const tokens = [{ seq: 1, level: 3 }, { seq: 2, level: 1 }, { seq: 3, level: 2 }, { seq: 4, level: 3 }];
    expect(await engine.nextCall(3, 0, tokens)).toEqual({ seq: 2, streak: 1 });
    expect(await engine.nextCall(3, 3, tokens)).toEqual({ seq: 1, streak: 0 });
    expect(await engine.nextCall(3, 0, [{ seq: 5, level: 3 }])).toEqual({ seq: 5, streak: 0 });
    expect(await engine.nextCall(3, 2, [])).toEqual({ seq: null, streak: 2 });
  });
  it('search finds CAP ID prefixes and names', async () => {
    const students = [{ capId: 'EN26100001', name: 'DAS KARTIK' }, { capId: 'EN26100002', name: 'PATIL DIYA' }, { capId: 'EN26200003', name: 'KADAM DIYA' }];
    expect((await engine.search('prefix', 'EN26100', students)).matches).toEqual([0, 1]);
    expect((await engine.search('name', 'diya', students)).matches).toEqual([1, 2]);
  });
  it('allotment never exceeds seats, respects merit order and skips unverified students', async () => {
    const r = await engine.allotment({
      round: 1,
      courses: [{ id: 1, seats: 1 }, { id: 2, seats: 1 }],
      students: [
        { id: 1, rank: 3, verified: true, prefs: [1, 2] },
        { id: 2, rank: 1, verified: true, prefs: [1, 2] },
        { id: 3, rank: 2, verified: true, prefs: [1, 2] },
        { id: 4, rank: 4, verified: false, prefs: [1, 2] },
=======
});

describe('C++ engine through the Node subprocess client', () => {
  it('health reports ok with a passing self check', async () => {
    const h = await engine.health();
    expect(h.status).toBe('ok');
    expect(h.selfCheck).toBe(true);
    expect(h.ops).toEqual(expect.arrayContaining(['search', 'queue_step', 'allotment', 'import_check']));
  });
  it('hash-table import check classifies new / repeated / existing IDs', async () => {
    const r = await engine.importCheck(['A00001'], ['A00001', 'B00002', 'B00002', 'C00003']);
    expect(r.status).toEqual(['already_exists', 'new', 'duplicate_in_file', 'new']);
  });
  it('merge sort is stable and the heap-based queue serves priority before regular', async () => {
    const s = await engine.rankWorklist('arrivals_priority', [
      { id: 1, level: 3, minutes: 10 }, { id: 2, level: 1, minutes: 20 }, { id: 3, level: 3, minutes: 5 }, { id: 4, level: 1, minutes: 20 },
    ]);
    expect(s.order[0]).toBe(2);
    expect(s.stats.algorithm).toBe('merge sort');
  });
  it('allotment simulation never exceeds seats and respects merit order', async () => {
    const r = await engine.allotment({
      action: 'round1',
      courses: [{ id: 1, label: 'C1', seats: 1 }, { id: 2, label: 'C2', seats: 1 }],
      students: [
        { id: 1, name: 'low', rank: 3, verified: true, prefs: [1, 2] },
        { id: 2, name: 'top', rank: 1, verified: true, prefs: [1, 2] },
        { id: 3, name: 'mid', rank: 2, verified: true, prefs: [1, 2] },
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
      ],
    });
    const by = new Map(r.students.map((s) => [s.id, s]));
    expect(by.get(2)!.allotment).toBe(1);
    expect(by.get(3)!.allotment).toBe(2);
<<<<<<< HEAD
    expect(by.get(1)!.allotment).toBeNull();
    expect(by.get(1)!.status).toBe(2);
    expect(by.get(4)!.status).toBe(0);
    expect(r.waiting).toEqual([1]);
    for (const c of r.courses) expect(c.filled).toBeLessThanOrEqual(c.seats);
  });
  it('round 2 lets an allotted student move up when a better seat is free', async () => {
    const r = await engine.allotment({
      round: 2,
      courses: [{ id: 1, seats: 1, filled: 0 }, { id: 2, seats: 1, filled: 1 }],
      students: [{ id: 1, rank: 1, verified: true, prefs: [1, 2], status: 1, allotment: 2, prefNo: 2 }],
    });
    expect(r.students[0]).toMatchObject({ status: 1, allotment: 1, prefNo: 1 });
    expect(r.courses.map((c) => c.filled)).toEqual([1, 0]);
  });
  it('planner steps: appointment load and document readiness', async () => {
    const load = await engine.appointmentLoad({ rows: 2, cols: 6, fromCol: 1, toCol: 4, bookings: [[0, 2], [0, 2], [1, 3]] });
    expect(load.rowSums).toEqual([2, 1]);
    expect(load.booked).toBe(2);
    const d = await engine.docReadiness({ docs: 2, rounds: 2, roundTotals: [10, 20], cells: [{ doc: 0, round: 0, count: 5 }, { doc: 1, round: 1, count: 20 }, { doc: 0, round: 1, count: 10 }] });
    expect(d.percent).toEqual([50, 50, 0, 100]);
    expect(d.weakestDoc).toBe(0);
  });
  it('a request the engine rejects comes back as a typed error', async () => {
    await expect(engine.appointmentLoad({ rows: 0, cols: 6, fromCol: 1, toCol: 4, bookings: [] })).rejects.toBeInstanceOf(EngineError);
  });
  it('a missing C++ program falls back to the TypeScript copy', async () => {
    const old = process.env.ENGINE_PATH;
    process.env.ENGINE_PATH = '/nonexistent/engine';
    try {
      const h = await engine.health();
      expect(h.mode).toBe('typescript');
      expect(h.selfCheck).toBe(true);
=======
    expect(by.get(1)!.allotment).toBeFalsy();
    for (const c of r.courses) expect(c.filled).toBeLessThanOrEqual(c.seats);
  });
  it('bad requests come back as safe, typed errors', async () => {
    await expect(runEngine('no_such_op', {})).rejects.toBeInstanceOf(EngineError);
    await expect(engine.search('app_prefix', 'x'.repeat(200), [])).rejects.toBeInstanceOf(EngineError);
  });
  it('a missing executable is reported as unavailable, without leaking the path to callers of the API', async () => {
    const old = process.env.ENGINE_PATH;
    process.env.ENGINE_PATH = '/nonexistent/engine';
    try {
      await expect(engine.health()).rejects.toMatchObject({ kind: 'unavailable' });
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
    } finally {
      if (old === undefined) delete process.env.ENGINE_PATH; else process.env.ENGINE_PATH = old;
    }
  });
});
<<<<<<< HEAD

// Only meaningful when cpp/build/engine exists (npm run build:engine): both must print exactly the same lines.
describe.runIf(existsSync(resolveEnginePath()))('C++ program and TypeScript copy give identical answers', () => {
  const cases: string[] = [
    'search prefix EN2610 3\nEN26100001 A_B\nEN26100002 C_D\nEN26200003 E_F',
    'search name DIYA 3\nEN26100001 A_B\nEN26100002 PATIL_DIYA\nEN26200003 KADAM_DIYA',
    'import_check 2 A1 B2 5 A1 C3 C3 D4 B2',
    'sort_desc 5\n1 5\n2 9.5\n3 9.5\n4 1\n5 7',
    'undo_top 4 3 8 21 40',
    'next_call 3 3 5\n1 3\n2 1\n3 2\n4 3\n5 1',
    'next_call 3 1 3\n10 2\n11 1\n12 1',
    'load 3 8 2 6 5\n0 3\n0 3\n1 4\n2 2\n2 2',
    'readiness 3 2 10 20 4\n0 0 5\n1 1 20\n2 0 10\n2 1 1',
  ];
  // a bigger allotment: 60 students, 5 courses, deterministic pseudo-random preferences
  const course = Array.from({ length: 5 }, (_, i) => `${i + 1} ${4 + i} 0`).join('\n');
  const studs = Array.from({ length: 60 }, (_, i) => {
    const prefs = [1 + (i % 5), 1 + ((i * 3) % 5), 1 + ((i * 7 + 2) % 5)].filter((v, k, a) => a.indexOf(v) === k);
    return `${i + 1} ${60 - i} 0 0 0 ${i % 9 === 0 ? 0 : 1} ${prefs.length} ${prefs.join(' ')}`;
  }).join('\n');
  cases.push(`allot 1 5\n${course}\n60\n${studs}`);
  cases.push('allot 2 2\n1 1 0\n2 1 1\n2\n1 1 1 2 2 1 2 1 2\n2 2 0 0 0 1 1 1');

  it.each(cases.map((c, i) => [i, c] as const))('request %i', async (_i, input) => {
    expect(runFallback(input)).toEqual(await runCpp(input));
  });
});
=======
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
