import test from 'node:test';

import assert from 'node:assert/strict';

import { spawn } from 'node:child_process';

import { once } from 'node:events';

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

import { tmpdir } from 'node:os';

import { join } from 'node:path';

import { checkCompatibility } from '../shared/compatibility.ts';

import { childEnvironment, runProcess } from '../shared/process.ts';

import { removeOwnedRun, writeJson } from '../shared/files.ts';

import { scanProfile } from '../shared/profile.ts';

import { rescueProfile, restoreRescue } from '../src/rescue.ts';

import { Guardian, type ManagedBundle, type ManagedPlugin, type PluginManagerAdapter, type ChangeResult } from '../src/guardian.ts';

const RUNTIME_VERSION = '0.2.0-rc.2';

import type { PluginRecord } from '../shared/types.ts';

import { GuardianController } from '../src/controller.ts';

import { TYPERT } from '../src/typert.ts';

import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader';

const plugin = (name: string, patch: Partial<PluginRecord> = {}): PluginRecord => ({ name, version: '1.0.0', enabled: true,
  removable: true, protected: false, rowIds: [], manifest: { peerDependencies: { '@deepseek-ai/dsh-tools': '>=0.2.0-rc.1 <0.3.0' } }, ...patch });

async function temporary(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-toolkit-test-'));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}

test('版本检查与官方预发布范围语义一致，升级时只隔离不兼容插件', () => {
  const good = plugin('good'), old = plugin('old', { manifest: { peerDependencies: { '@deepseek-ai/dsh-tools': '<0.2.0-0' } } });
  const report = checkCompatibility([old, good], RUNTIME_VERSION);
  assert.deepEqual(report.quarantine, ['old']); assert.equal(report.findings[0].code, 'dsh-version');
  assert.equal(checkCompatibility([good], '0.3.0').quarantine[0], 'good');
});

test('缺失兼容声明只警告，禁用项不影响运行', () => {
  const report = checkCompatibility([plugin('unknown', { manifest: {} }), plugin('disabled', { enabled: false, loadError: 'broken' })], RUNTIME_VERSION);
  assert.equal(report.findings[0].severity, 'warning'); assert.deepEqual(report.quarantine, []);
});

test('重复顶层条目、工具和服务保留优先级较高者', () => {
  const a = plugin('a', { rowIds: ['same'], manifest: { dshCompat: { tools: ['read_pdf'], services: ['pdf'], priority: 10 } } });
  const b = plugin('b', { rowIds: ['same'], manifest: { dshCompat: { tools: ['read_pdf'], services: ['pdf'] } } });
  const report = checkCompatibility([a, b], RUNTIME_VERSION);
  assert.deepEqual(report.quarantine, ['b']);
  assert.equal(report.findings.filter(x => x.code.startsWith('duplicate')).length, 3);
});

test('依赖级联停用，并保护官方组件', () => {
  const core = plugin('@deepseek-ai/core', { protected: true, manifest: { dshCompat: { conflicts: { bad: '*' } } } });
  const bad = plugin('bad');
  const dependent = plugin('dependent', { manifest: { dshCompat: { requires: { bad: '^1.0.0' } } } });
  const report = checkCompatibility([core, bad, dependent], RUNTIME_VERSION);
  assert.deepEqual(report.quarantine, ['bad', 'dependent']); assert.deepEqual(report.unresolved, []);
});

test('受保护组件自身失败必须作为未解决问题返回', () => {
  const report = checkCompatibility([plugin('protected', { protected: true, loadError: 'boom' })], RUNTIME_VERSION);
  assert.equal(report.unresolved.length, 1); assert.deepEqual(report.quarantine, []);
});

test('Node、系统限制和错误元数据均产生可定位结果', () => {
  const rows = [plugin('node', { manifest: { engines: { node: '>=99' } } }),
    plugin('os', { manifest: { os: ['!win32'] } }), plugin('bad-range', { manifest: { dshCompat: { dsh: 'tomorrow' } } })];
  const report = checkCompatibility(rows, RUNTIME_VERSION, { platform: 'win32' });
  assert.equal(report.findings.filter(x => x.severity === 'error').length, 3);
});

test('旧核心直接依赖和损坏的标准字段被定位到对应插件', () => {
  const rows = [plugin('old-stack', { manifest: { dependencies: { '@deepseek-ai/dsh-tools': '^0.0.1-rc.1' } } }),
    plugin('malformed', { manifest: { os: 'win32' } as unknown as PluginRecord['manifest'] }), plugin('healthy')];
  const report = checkCompatibility(rows, RUNTIME_VERSION);
  assert(report.findings.some(x => x.code === 'embedded-runtime'));
  assert(report.findings.some(x => x.code === 'invalid-metadata' && x.plugins[0] === 'malformed'));
  assert(!report.quarantine.includes('healthy'));
});

test('环境仅传递明确允许的凭据，不传递宿主其他密钥和注入参数', () => {
  const env = childEnvironment(['DEEPSEEK_API_KEY'], { PATH: '/bin', SECRET: 'hidden', NODE_OPTIONS: 'inject', DEEPSEEK_API_KEY: 'test' });
  assert.equal(env.SECRET, undefined); assert.equal(env.NODE_OPTIONS, undefined); assert.equal(env.DEEPSEEK_API_KEY, 'test');
  assert.throws(() => childEnvironment(['NODE_OPTIONS']), /不允许/);
});

test('取消会结束实际子进程，失败输出不会被当成成功', async t => {
  const root = await temporary(t);
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { cwd: root, timeoutMs: 100 }), /abort|timeout/i);
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.exit(3)'], { cwd: root }), /退出码 3/);
});

test('临时环境清理要求所有权标记和路径归属', async t => {
  const root = await temporary(t), run = join(root, 'runs', 'one');
  await mkdir(run, { recursive: true }); await writeJson(join(run, '.autocompose-owner.json'), { id: 'one' });
  await assert.rejects(removeOwnedRun(join(root, 'runs'), run, 'other'), /标记不匹配/);
  await assert.rejects(removeOwnedRun(run, root, 'one'), /路径超出/);
  await removeOwnedRun(join(root, 'runs'), run, 'one');
});

async function fixtureProfile(root: string) {
  const profile = { name: 'fixture', private: true, description: '保留用户字段', dependencies: { 'fixture-good': '1.0.0', 'fixture-old': '1.0.0' },
    dsh: { profile: { bundles: ['fixture-good', 'fixture-old'] } } };
  await writeJson(join(root, 'package.json'), profile);
  for (const [name, range] of [['fixture-good', '*'], ['fixture-old', '<0.2.0-0']]) {
    const dir = join(root, 'node_modules', name);
    await mkdir(dir, { recursive: true });
    await writeJson(join(dir, 'package.json'), { name, version: '1.0.0', type: 'module', main: 'index.js',
      dsh: { bundle: { patch: './cordis.patch.yml' } }, peerDependencies: { '@deepseek-ai/dsh-tools': range } });
    await writeFile(join(dir, 'index.js'), 'throw new Error("scanner must not execute me")');
    await writeFile(join(dir, 'cordis.patch.yml'), `- insert:\n    - id: ${name}\n      name: ${name}\n      config:\n        value: !!js process.exit(99)\n`);
  }
  await writeFile(join(root, 'cordis.patch.yml'), '# keep me\n[]\n'); return profile;
}

test('离线扫描不执行插件或 !!js；修复保存原配置，拒绝带冲突恢复', async t => {
  const root = await temporary(t); await fixtureProfile(root);
  const original = await readFile(join(root, 'package.json'), 'utf8');
  const rows = await scanProfile(root); assert.equal(rows.length, 2); assert.equal(rows[0].loadError, undefined);
  const preview = await rescueProfile(root, RUNTIME_VERSION); assert.deepEqual(preview.targets, ['fixture-old']);
  assert.equal(await readFile(join(root, 'package.json'), 'utf8'), original);
  const result = await rescueProfile(root, RUNTIME_VERSION, { apply: true }); assert.equal(result.applied, true);
  assert.equal(await readFile(join(root, 'cordis.patch.yml'), 'utf8'), '# keep me\n[]\n');
  const backup = JSON.parse(await readFile(result.recordPath!, 'utf8')); assert.equal(backup.before, original);
  await assert.rejects(restoreRescue(root, result.recoveryId!, RUNTIME_VERSION), /冲突仍存在/);
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); manifest.description = '后来编辑';
  await writeJson(join(root, 'package.json'), manifest);
  await restoreRescue(root, result.recoveryId!, '0.1.7-rc.2');
  const restored = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(restored.description, '后来编辑'); assert(restored.dsh.profile.bundles.includes('fixture-old'));
});

class Manager implements PluginManagerAdapter {
  bundles: ManagedBundle[];
  plugins: ManagedPlugin[] = [];
  operations: string[] = [];
  application: ChangeResult['application'] = 'applied';
  constructor(records: PluginRecord[]) { this.bundles = records.map(x => ({ name: x.name, version: x.version, enabled: x.enabled,
    removable: x.removable, installed: true, rows: [{ rowId: x.name, moduleName: x.name, entryId: x.name }] })); }
  async listBundles() { return structuredClone(this.bundles); }
  async listPlugins() { return structuredClone(this.plugins); }
  async setBundleEnabled(name: string, enabled: boolean): Promise<ChangeResult> {
    this.operations.push(`${enabled ? 'enable' : 'disable'}:${name}`);
    if (['applied', 'restart-required'].includes(this.application)) this.bundles.find(x => x.name === name)!.enabled = enabled;
    return { changed: this.application === 'applied', target: name, stage: 'enable', application: this.application };
  }
  async removeBundle(name: string): Promise<ChangeResult> {
    this.operations.push(`remove:${name}`); this.bundles = this.bundles.filter(x => x.name !== name);
    return { changed: true, target: name, stage: 'remove', application: 'applied' };
  }
}

test('Guardian 先备份后停用；只有 remove 策略执行卸载', async t => {
  const root = await temporary(t);
  const rows = [plugin('old', { manifest: { peerDependencies: { '@deepseek-ai/dsh': '<0.2.0-0' } } })];
  await writeJson(join(root, 'package.json'), { dsh: { profile: { bundles: ['old'] } } });
  const manager = new Manager(rows), guardian = new Guardian(manager, { directory: root, runtimeVersion: RUNTIME_VERSION, scan: async () => rows });
  const result = await guardian.reconcile(); assert.equal(result.changes[0].status, 'quarantined');
  assert.deepEqual(manager.operations, ['disable:old']); assert(result.changes[0].snapshot.files['package.json']);
  manager.bundles[0].enabled = true;
  const removed = await guardian.reconcile('remove'); assert.equal(removed.changes[0].status, 'removed');
  assert.deepEqual(manager.operations.slice(1), ['disable:old', 'remove:old']);
});

test('Guardian 识别暂态失败并在连续失败后隔离', async t => {
  const root = await temporary(t), rows = [plugin('flaky')], manager = new Manager(rows);
  manager.plugins = [{ entryId: 'flaky', moduleName: 'flaky', enabled: true, fiberPhase: 'failed' }];
  const guardian = new Guardian(manager, { directory: root, runtimeVersion: RUNTIME_VERSION, scan: async () => rows });
  assert.equal((await guardian.reconcile()).changes.length, 0);
  assert.equal((await guardian.reconcile()).changes[0].status, 'quarantined');
});

test('停用失败后不得继续卸载，也不能声称隔离成功', async t => {
  const root = await temporary(t), rows = [plugin('old', { manifest: { dshCompat: { dsh: '<0.2.0-0' } } })], manager = new Manager(rows);
  manager.application = 'failed';
  const guardian = new Guardian(manager, { directory: root, runtimeVersion: RUNTIME_VERSION, scan: async () => rows });
  const result = await guardian.reconcile('remove');
  assert.equal(result.changes[0].status, 'failed'); assert.deepEqual(manager.operations, ['disable:old']);
});

test('运行恢复只重启选定插件，保留原有配置并报告需重启', async t => {
  const root = await temporary(t), rows = [plugin('broken')], manager = new Manager(rows);
  manager.plugins = [{ entryId: 'broken', moduleName: 'broken', enabled: true, fiberPhase: 'failed' }];
  const guardian = new Guardian(manager, { directory: root, runtimeVersion: RUNTIME_VERSION, scan: async () => rows, failureThreshold: 1 });
  const result = await guardian.reconcile(); manager.plugins = []; manager.application = 'restart-required';
  const restored = await guardian.restore(result.changes[0].id);
  assert.equal(restored.status, 'restored'); assert.equal(restored.result?.application, 'restart-required');
});

test('启动型宿主拒绝卸载后保留隔离，下次启动继续一次卸载', async t => {
  const root = await temporary(t), rows = [plugin('old', { manifest: { dshCompat: { dsh: '<0.2.0-0' } } })], manager = new Manager(rows);
  const remove = manager.removeBundle.bind(manager);
  let attempts = 0;
  manager.removeBundle = async name => { attempts++; return { changed: false, application: 'failed', target: name, stage: 'remove', error: { code: 'stop-profile' } }; };
  const options = { directory: root, runtimeVersion: RUNTIME_VERSION, scan: async () => rows, policy: 'remove' as const };
  const guardian = new Guardian(manager, options);
  const first = await guardian.reconcile();
  assert.equal(first.changes[0].status, 'quarantined'); assert.equal(first.changes[0].removalPending, true);
  await guardian.reconcile(); assert.equal(attempts, 1);
  manager.removeBundle = remove;
  const next = await new Guardian(manager, options).reconcile();
  assert.equal(next.changes[0].status, 'removed');
});

test('升级预检只读，旧检查结果不能作用于已经更新的插件', async t => {
  const root = await temporary(t), rows = [plugin('future')], manager = new Manager(rows);
  const guardian = new Guardian(manager, { directory: root, runtimeVersion: RUNTIME_VERSION, scan: async () => rows });
  const future = await guardian.overview('0.3.0');
  assert.deepEqual(future.report.quarantine, ['future']);
  assert.deepEqual(manager.operations, []);
  assert.equal((await guardian.state()).runtimeVersion, undefined);
  rows[0].manifest = { dshCompat: { dsh: '<0.2.0-0' } };
  await assert.rejects(guardian.reconcile('quarantine', future.revision), /状态已变化/);
  assert.deepEqual(manager.operations, []);
  await assert.rejects(guardian.overview('latest'), /完整的 DSH 版本/);
});

test('守护策略跨宿主保存，浏览器响应不包含备份内容', async t => {
  const root = await temporary(t), rows = [plugin('old', { manifest: { dshCompat: { dsh: '<0.2.0-0' } } })], manager = new Manager(rows);
  const options = { directory: root, runtimeVersion: RUNTIME_VERSION, scan: async () => rows };
  await writeJson(join(root, 'package.json'), { sentinel: 'private-backup-content' });
  const guardian = new Guardian(manager, options), controller = new GuardianController(guardian);
  await controller.request(JSON.stringify({ action: 'setPolicy', policy: 'report' }));
  assert.equal(await new Guardian(manager, options).policy(), 'report');
  await guardian.reconcile(); assert.deepEqual(manager.operations, []);
  const preview = await guardian.overview();
  const result = await controller.request(JSON.stringify({ action: 'repair', policy: 'quarantine', revision: preview.revision }));
  assert.equal(JSON.parse(result).changes[0].status, 'quarantined');
  assert(!result.includes('private-backup-content')); assert(!result.includes('snapshot'));
  const overview = await controller.request(JSON.stringify({ action: 'overview' }));
  assert(!overview.includes('private-backup-content'));
});

test('隔离后在外部重新启用或更新插件，会结束旧记录而不卸载新版本', async t => {
  const root = await temporary(t), rows = [plugin('old', { manifest: { dshCompat: { dsh: '<0.2.0-0' } } })];
  const manager = new Manager(rows), guardian = new Guardian(manager, { directory: root, runtimeVersion: RUNTIME_VERSION, scan: async () => rows });
  await guardian.reconcile();
  manager.bundles[0].enabled = true;
  rows[0].manifest = { dshCompat: { dsh: '*' } };
  await guardian.reconcile('report');
  assert.equal((await guardian.state()).records[0].status, 'restored');
  rows[0].manifest = { dshCompat: { dsh: '<0.2.0-0' } };
  await guardian.reconcile();
  manager.bundles[0].version = '2.0.0'; rows[0].version = '2.0.0';
  await guardian.reconcile('remove');
  assert.equal((await guardian.state()).records[1].status, 'superseded');
  assert(!manager.operations.some(x => x.startsWith('remove:')));
});

test('升级插件后连续失败重新计数，不继承旧版本故障', async t => {
  const root = await temporary(t), rows = [plugin('flaky')], manager = new Manager(rows);
  manager.plugins = [{ entryId: 'flaky', moduleName: 'flaky', enabled: true, fiberPhase: 'failed' }];
  const guardian = new Guardian(manager, { directory: root, runtimeVersion: RUNTIME_VERSION, scan: async () => rows });
  await guardian.reconcile();
  manager.bundles[0].version = '2.0.0'; rows[0].version = '2.0.0';
  assert.equal((await guardian.reconcile()).changes.length, 0);
  const failures = (await guardian.state()).failures;
  assert.equal(Object.keys(failures).length, 1);
  assert.equal(failures[`flaky@2.0.0|${RUNTIME_VERSION}`], 1);
  assert.equal((await guardian.reconcile()).changes[0].status, 'quarantined');
});

test('RPC 描述通过实际 DSH 的严格工厂验证', () => {
  const validated = validateTypertManifest('dsh-compat-guardian', TYPERT);
  assert.equal(validated.invocations[0].service, 'compatGuardianUI');
  const codec = TYPERT.invocations[0].parameters[0].codec;
  assert.equal(codec.create().safeParse('ok').success, true);
  assert.equal(codec.create().safeParse({ command: 'wrong wire type' }).success, false);
});

test('升级预检按基础组件随 DSH 升级计算，保留附加插件约束', async t => {
  const root = await temporary(t);
  const rows = [plugin('@deepseek-ai/dsh-base', { protected: true, removable: false,
    manifest: { dependencies: { '@deepseek-ai/dsh-tools': RUNTIME_VERSION } } }), plugin('addon')];
  const guardian = new Guardian(new Manager(rows), { directory: root, runtimeVersion: RUNTIME_VERSION, scan: async () => rows });
  const view = await guardian.overview('0.3.0');
  assert.deepEqual(view.report.quarantine, ['addon']); assert.deepEqual(view.report.unresolved, []);
  assert(!view.report.findings.some(x => x.plugins.includes('@deepseek-ai/dsh-base')));
});

test('同名服务并行加载时保留实际已运行的一方，避免先后隔离双方', async t => {
  const root = await temporary(t);
  const rows = [plugin('preferred', { manifest: { dshCompat: { services: ['shared'], priority: 10 } } }),
    plugin('running', { manifest: { dshCompat: { services: ['shared'], priority: 0 } } })];
  const manager = new Manager(rows);
  manager.plugins = [ { entryId: 'preferred', moduleName: 'preferred', enabled: true, fiberPhase: 'failed' },
    { entryId: 'running', moduleName: 'running', enabled: true, fiberPhase: 'active' } ];
  const guardian = new Guardian(manager, { directory: root, runtimeVersion: RUNTIME_VERSION, scan: async () => rows });
  assert.deepEqual((await guardian.overview()).report.quarantine, ['preferred']);
  assert.deepEqual((await guardian.reconcile()).changes.map(x => x.plugin), ['preferred']);
  assert.equal((await guardian.reconcile()).changes.length, 0);
  assert(manager.bundles.find(x => x.name === 'running')?.enabled);
});
