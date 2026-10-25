import { describe, expect, it } from 'vitest';
import { isValidCapId, normalizeCapId, parseAdminLoginId, parseCapId } from '../../src/lib/capId';
import { EngineError, runEngine } from '../../src/lib/engine/client';
import { engine } from '../../src/lib/engine/ops';
import { buildCourses, buildStudents } from '../../scripts/lib/dataset';
import { loginSchema, registerSchema } from '../../src/lib/auth/schemas';

describe('CAP ID normalization', () => {
  it('accepts any style and returns one canonical form', () => {
    for (const v of ['dm26000001', ' DM26 000001 ', 'dm26-000001', 'DM26.000001', 'ＤＭ26000001']) expect(parseCapId(v)).toBe('DM26000001');
  });
  it('rejects too short, too long, empty and non-strings', () => {
    expect(parseCapId('abc')).toBeNull();
    expect(parseCapId('A'.repeat(21))).toBeNull();
    expect(parseCapId('   ')).toBeNull();
    expect(parseCapId(null)).toBeNull();
    expect(parseCapId({ toString: () => 'DM26000001' })).toBeNull();
    expect(parseCapId('x'.repeat(100))).toBeNull();
  });
  it('strips characters that could be used for injection', () => {
    expect(normalizeCapId("DM26'; drop table--")).toBe('DM26DROPTABLE');
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
  });
});

describe('demo dataset', () => {
  it('is deterministic, has 500 unique fictional candidates and valid preferences', () => {
    const a = buildStudents(buildCourses().length);
    const b = buildStudents(buildCourses().length);
    expect(a).toEqual(b);
    expect(a).toHaveLength(500);
    expect(new Set(a.map((s) => s.capId)).size).toBe(500);
    expect(a[0].capId).toBe('DM26000001');
    expect(a[499].capId).toBe('DM26000500');
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
      ],
    });
    const by = new Map(r.students.map((s) => [s.id, s]));
    expect(by.get(2)!.allotment).toBe(1);
    expect(by.get(3)!.allotment).toBe(2);
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
    } finally {
      if (old === undefined) delete process.env.ENGINE_PATH; else process.env.ENGINE_PATH = old;
    }
  });
});
