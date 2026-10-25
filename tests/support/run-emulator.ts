// Starts a throw-away database + the Supabase emulator and keeps running (for manual debugging of scripts).
//   npx tsx tests/support/run-emulator.ts
import { createTestDb } from './db';
import { EMU_PORT, ADMIN } from './stack';
import { startEmulator } from './emulator';

async function main() {
  const db = await createTestDb('aq_dev');
  await startEmulator({ dbUrl: db.url, port: EMU_PORT, confirmEmail: false });
  console.log(`emulator ready on ${EMU_PORT}; admin ${ADMIN.loginId}`);
}
main();
