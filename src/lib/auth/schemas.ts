import { z } from 'zod';
import { parseAdminLoginId, parseCapId } from '@/lib/capId';

export const passwordRule = z
  .string({ error: 'Enter a password.' })
  .min(8, 'Use at least 8 characters.')
  .max(72, 'Use at most 72 characters.')
  .refine((p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p), 'Use at least one letter and one number.');

const capIdField = z
  .string({ error: 'Enter your CAP Application ID.' })
  .max(60, 'That CAP ID is too long.')
  .refine((v) => parseCapId(v) !== null, 'Enter a valid CAP ID (6 to 20 letters and numbers).');

export const loginSchema = z.object({
  capId: capIdField,
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.').max(200),
});

export const registerSchema = z
  .object({
    fullName: z.string({ error: 'Enter your full name.' }).trim().min(2, 'Enter your full name.').max(120, 'That name is too long.'),
    email: z.string({ error: 'Enter your email.' }).trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address.')),
    capId: capIdField,
    password: passwordRule,
    confirmPassword: z.string({ error: 'Repeat the password.' }),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'The passwords do not match.' });

export const forgotSchema = z.object({ capId: capIdField });

export const resetSchema = z
  .object({ password: passwordRule, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'The passwords do not match.' });

export const adminLoginSchema = z.object({
  loginId: z
    .string({ error: 'Enter your admin login ID.' })
    .max(64)
    .refine((v) => parseAdminLoginId(v) !== null, 'Enter a valid admin login ID.'),
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.').max(200),
});
