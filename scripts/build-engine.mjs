<<<<<<< HEAD
// Builds the small C++ program the website uses (cpp/engine/main.cpp -> cpp/build/engine).
//   node scripts/build-engine.mjs            build the engine
//   node scripts/build-engine.mjs --if-missing   build only when it is missing or older than main.cpp
//   node scripts/build-engine.mjs --demos    also build the 8 terminal demos into cpp/build/
//   node scripts/build-engine.mjs --require  fail (exit 1) when there is no C++ compiler
//
// Without --require a missing compiler only prints a warning: the website then runs its TypeScript copy of the
// same steps (the admin dashboard and /api/health/engine say which one is active).
=======
// Builds (and optionally tests) the C++ engine. Works on Windows (MinGW g++), Linux and macOS.
//   node scripts/build-engine.mjs               build engine/build/admitqueue_engine(.exe)
//   node scripts/build-engine.mjs --if-missing  build only when the executable is missing or older than the sources
//   node scripts/build-engine.mjs --check       only verify that a C++17 compiler exists
//   node scripts/build-engine.mjs --tests       build and run all C++ unit tests
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
<<<<<<< HEAD
const cppDir = path.join(root, 'cpp');
const buildDir = path.join(cppDir, 'build');
const ext = process.platform === 'win32' ? '.exe' : '';
const exe = path.join(buildDir, `engine${ext}`);
const source = path.join(cppDir, 'engine', 'main.cpp');
const args = new Set(process.argv.slice(2));

function findCompiler() {
  for (const c of [process.env.CXX, 'g++', 'clang++', 'c++'].filter(Boolean)) {
=======
const engineDir = path.join(root, 'engine');
const buildDir = path.join(engineDir, 'build');
const exe = path.join(buildDir, process.platform === 'win32' ? 'admitqueue_engine.exe' : 'admitqueue_engine');
const args = new Set(process.argv.slice(2));

function findCompiler() {
  const candidates = [process.env.CXX, 'g++', 'clang++', 'c++'].filter(Boolean);
  for (const c of candidates) {
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return { cmd: c, version: (r.stdout || '').split('\n')[0] };
  }
  return null;
}

const compiler = findCompiler();
if (!compiler) {
<<<<<<< HEAD
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
=======
  console.error('ERROR: no C++ compiler found (tried g++, clang++, c++).');
  console.error('  Windows: install MSYS2 or WinLibs and add its "bin" folder to PATH, then open a NEW terminal.');
  console.error('  Linux:   sudo apt install g++      macOS: xcode-select --install');
  process.exit(1);
}
console.log(`Compiler: ${compiler.cmd} (${compiler.version})`);
if (args.has('--check')) process.exit(0);

const srcFiles = readdirSync(path.join(engineDir, 'src')).filter((f) => f.endsWith('.cpp')).sort();
const flags = ['-std=c++17', '-O2', '-Wall', '-Wextra', '-I', path.join(engineDir, 'include')];
const linkFlags = ['-static-libgcc', '-static-libstdc++'];
if (process.platform === 'win32') linkFlags.push('-static'); // no MinGW DLLs needed next to the .exe

function newestSource() {
  let newest = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (/\.(cpp|h|hpp)$/.test(name)) newest = Math.max(newest, s.mtimeMs);
    }
  };
  walk(path.join(engineDir, 'src'));
  walk(path.join(engineDir, 'include'));
  return newest;
}

function compile(files, output) {
  mkdirSync(buildDir, { recursive: true });
  const r = spawnSync(compiler.cmd, [...flags, ...files, '-o', output, ...linkFlags], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`ERROR: compiling ${path.basename(output)} failed.`);
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
    process.exit(r.status || 1);
  }
}

<<<<<<< HEAD
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
=======
if (args.has('--tests')) {
  const libs = srcFiles.filter((f) => f !== 'main.cpp').map((f) => path.join(engineDir, 'src', f));
  const tests = readdirSync(path.join(engineDir, 'tests')).filter((f) => /^test_.*\.cpp$/.test(f)).sort();
  let failed = 0;
  for (const t of tests) {
    const out = path.join(buildDir, t.replace(/\.cpp$/, process.platform === 'win32' ? '.exe' : ''));
    console.log(`\n=== ${t}`);
    compile([...libs, path.join(engineDir, 'tests', t)], out);
    const r = spawnSync(out, [], { encoding: 'utf8' });
    const lines = (r.stdout || '').split('\n').filter(Boolean);
    for (const l of lines.filter((x) => !x.startsWith('PASS'))) console.log(l);
    if (r.status !== 0) failed++;
  }
  console.log(failed === 0 ? '\nAll C++ test programs passed.' : `\n${failed} C++ test program(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}

if (args.has('--if-missing') && existsSync(exe) && statSync(exe).mtimeMs >= newestSource()) {
  console.log(`Engine is up to date: ${exe}`);
  process.exit(0);
}

console.log('Building the engine ...');
compile(srcFiles.map((f) => path.join(engineDir, 'src', f)), exe);

// smoke test through the real stdin/stdout protocol
const smoke = spawnSync(exe, [], { input: '{"op":"health"}', encoding: 'utf8' });
let healthy = false;
try {
  healthy = JSON.parse(smoke.stdout).result.selfCheck === true;
} catch {
  healthy = false;
}
if (!healthy) {
  console.error('ERROR: the engine was built but its health check failed.');
  process.exit(1);
}
console.log(`OK: ${exe}`);
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
