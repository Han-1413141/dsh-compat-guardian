import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

const root = await mkdtemp(join(tmpdir(), 'dsh-toolkit-conflicts-'));
const cli = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js'));
const reportPath = join(root, 'report.json');
const env = { ...process.env, DSH_HOME: join(root, 'home'), DSH_PRIMARY_RUNTIME: '', DSH_TELEMETRY_DISABLED: '1',
  DSH_TOOLKIT_CONFLICT_REPORT: reportPath, DSH_TOOLKIT_FAULT_REPAIRED: '0' };
delete env.DEEPSEEK_API_KEY;
let child, logs = '';
try {
  const names = ['service-owner', 'service-conflict', 'old-api', 'load-failure', 'dependent'];
  await promisify(execFile)(process.execPath, [cli, 'plugin', '--profile', 'web', 'add', ...names.map(x => resolve('tests/fixtures/plugins', x)), '--ignore-scripts'],
    { cwd: root, env, windowsHide: true, timeout: 90000 });
  const patch = join(root, 'observe.patch.yml');
  await writeFile(patch, stringify([{ insert: [{ id: 'conflict-observer', name: resolve('tests/fixtures/conflict-observer.mjs') }] }]));
  child = spawn(process.execPath, [cli, '--profile', 'web', '--patch', patch, '--no-open', '--port', '0'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', x => { logs = (logs + x).slice(-64000); });
  const deadline = Date.now() + 75000;
  let report;
  while (Date.now() < deadline) {
    try { report = JSON.parse(await readFile(reportPath, 'utf8')); break; } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    if (child.exitCode !== null) throw new Error(`宿主提前退出：${child.exitCode}\n${logs}`);
    await new Promise(done => setTimeout(done, 300));
  }
  await mkdir('.test-output', { recursive: true });
  await writeFile('.test-output/conflict-host.log', logs.replace(/\?token=[^\s]+/g, '?token=<redacted>'));
  if (!report) throw new Error('故障测试超时，请检查 .test-output/conflict-host.log');
  await writeFile('.test-output/conflict-report.json', JSON.stringify(report, null, 2));
  if (!report.ok) throw new Error(report.error);
  console.log('真实 DSH：同名服务、旧 API、加载异常均实际失败；依赖插件实际进入 pending。');
  console.log('Guardian：确定冲突立即隔离，连续异常达到阈值后隔离，并停用依赖方。');
  console.log('恢复：仍有冲突时拒绝；修复加载故障后，两级依赖均恢复 active。');
  console.log('卸载：通过真实 Plugin Manager 移除故障包，确认安装记录已消失。');
  console.log('故障证据：.test-output/conflict-report.json');
} finally {
  if (child?.exitCode === null) {
    if (process.platform === 'win32') await promisify(execFile)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
    else child.kill('SIGTERM');
    await new Promise(done => { if (child.exitCode !== null) done(); else child.once('exit', done); });
  }
  if (process.env.KEEP_CONFLICT_FIXTURES === '1') console.log(`保留测试目录：${root}`);
  else await rm(root, { recursive: true, force: true });
}
