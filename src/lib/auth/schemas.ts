import { z } from 'zod';
import { parseAdminLoginId, parseCapId } from '@/lib/capId';

const capIdField = z
  .string({ error: 'Enter your CAP Application ID.' })
  .max(60, 'That CAP ID is too long.')
  .refine((v) => parseCapId(v) !== null, 'Enter a valid CAP ID (6 to 20 letters and numbers).');

export const loginSchema = z.object({
  capId: capIdField,
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.').max(200),
});

export const adminLoginSchema = z.object({
  loginId: z
    .string({ error: 'Enter your admin login ID.' })
    .max(64)
    .refine((v) => parseAdminLoginId(v) !== null, 'Enter a valid admin login ID.'),
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.').max(200),
});
