// Environment access. Secrets are read only here, only on the server, and only when needed.

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function need(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') throw new ConfigError(`Missing environment variable ${name}. See .env.example.`);
  return value.trim();
}

export function supabaseUrl(): string {
  return need('NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
}

export function supabasePublishableKey(): string {
  return need('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
}

/** Server-only secret key. Never import this from client components. */
export function supabaseSecretKey(): string {
  return need('SUPABASE_SECRET_KEY');
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Demo mode links FICTIONAL records automatically at registration. Default: off. */
export function isDemoMode(): boolean {
  return (process.env.DEMO_MODE || '').trim().toLowerCase() === 'true';
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
