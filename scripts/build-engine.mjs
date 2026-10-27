// Builds the small C++ program the website uses (cpp/engine/main.cpp -> cpp/build/engine).
//   node scripts/build-engine.mjs            build the engine
//   node scripts/build-engine.mjs --if-missing   build only when it is missing or older than main.cpp
//   node scripts/build-engine.mjs --demos    also build the 8 terminal demos into cpp/build/
//   node scripts/build-engine.mjs --require  fail (exit 1) when there is no C++ compiler
//
// Without --require a missing compiler only prints a warning: the website then runs its TypeScript copy of the
// same steps (the admin dashboard and /api/health/engine say which one is active).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cppDir = path.join(root, 'cpp');
const buildDir = path.join(cppDir, 'build');
const ext = process.platform === 'win32' ? '.exe' : '';
const exe = path.join(buildDir, `engine${ext}`);
const source = path.join(cppDir, 'engine', 'main.cpp');
const args = new Set(process.argv.slice(2));

function findCompiler() {
  for (const c of [process.env.CXX, 'g++', 'clang++', 'c++'].filter(Boolean)) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return { cmd: c, version: (r.stdout || '').split('\n')[0] };
  }
  return null;
}

const compiler = findCompiler();
if (!compiler) {
  const msg = 'No C++ compiler found (tried g++, clang++, c++).';
  if (args.has('--require')) {
    console.error(`ERROR: ${msg}`);
    console.error('  Windows: install MSYS2 or WinLibs and add its "bin" folder to PATH, then open a NEW terminal.');
    console.error('  Linux:   sudo apt install g++');
    process.exit(1);
  }
  console.warn(`WARNING: ${msg} The website will use its TypeScript copy of the engine steps instead.`);
  process.exit(0);
}
console.log(`Compiler: ${compiler.cmd} (${compiler.version})`);

function compile(file, output) {
  mkdirSync(buildDir, { recursive: true });
  const link = process.platform === 'win32' ? ['-static'] : [];
  const r = spawnSync(compiler.cmd, ['-std=c++11', '-O2', '-Wall', file, '-o', output, ...link], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`ERROR: compiling ${path.basename(file)} failed.`);
    process.exit(r.status || 1);
  }
}

if (args.has('--if-missing') && existsSync(exe) && statSync(exe).mtimeMs >= statSync(source).mtimeMs) {
  console.log(`Engine is up to date: ${exe}`);
} else {
  console.log('Building the engine ...');
  compile(source, exe);
  const smoke = spawnSync(exe, [], { input: 'health', encoding: 'utf8' });
  if (!/SELFCHECK 1/.test(smoke.stdout || '')) {
    console.error('ERROR: the engine was built but its self check failed.');
    process.exit(1);
  }
  console.log(`OK: ${exe}`);
}

if (args.has('--demos')) {
  const dir = path.join(cppDir, 'demos');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.cpp')).sort()) {
    compile(path.join(dir, f), path.join(buildDir, f.replace(/\.cpp$/, ext)));
    console.log(`  built ${f}`);
  }
}
