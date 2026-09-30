import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Guardian } from '../../lib/core.js';

export const inject = ['pluginManager', 'profileContext'];
export function apply(ctx) {
  const output = process.env.DSH_TOOLKIT_CONFLICT_REPORT;
  if (!output) throw new Error('This observer requires an isolated test output path');
  let operation;
  const timer = setTimeout(() => {
    operation = exercise(ctx).then(result => writeFile(output, JSON.stringify(result, null, 2)))
      .catch(error => writeFile(output, JSON.stringify({ ok: false, error: error.stack }, null, 2)));
  }, 1800);
  ctx.effect(() => async () => { clearTimeout(timer); await operation; });
}
async function exercise(ctx) {
  const manager = ctx.pluginManager;
  const guardian = new Guardian(manager, { directory: ctx.profileContext.dir, installAnchor: ctx.profileContext.installAnchor,
    runtimeVersion: '0.2.0-rc.2', failureThreshold: 2, policy: 'quarantine' });
  const initial = (await manager.listPlugins()).filter(x => x.moduleName.startsWith('dsh-fixture-'));
  const servicePair = initial.filter(x => x.moduleName.startsWith('dsh-fixture-service-'));
  assert.equal(servicePair.filter(x => x.fiberPhase === 'active').length, 1);
  assert.equal(servicePair.filter(x => x.fiberPhase === 'failed').length, 1);
  const losingService = servicePair.find(x => x.fiberPhase === 'failed').moduleName;
  const winningService = servicePair.find(x => x.fiberPhase === 'active').moduleName;
  for (const name of ['old-api', 'load-failure']) {
    assert.equal(initial.find(x => x.moduleName === `dsh-fixture-${name}`)?.fiberPhase, 'failed', `expected real failure: ${name}`);
  }
  assert.equal(initial.find(x => x.moduleName === 'dsh-fixture-dependent')?.fiberPhase, 'pending');
  const preview = await guardian.inspect();
  assert(preview.findings.some(x => x.code === 'duplicate-service'));
  assert(preview.findings.some(x => x.code === 'dsh-version' && x.plugins.includes('dsh-fixture-old-api')));
  assert(preview.findings.some(x => x.code === 'load-failure' && x.plugins.includes('dsh-fixture-load-failure')));
  const first = await guardian.reconcile();
  assert(first.changes.some(x => x.plugin === losingService && x.status === 'quarantined'));
  assert(!first.changes.some(x => x.plugin === winningService));
  assert(first.changes.some(x => x.plugin === 'dsh-fixture-old-api' && x.status === 'quarantined'));
  assert(!first.changes.some(x => x.plugin === 'dsh-fixture-load-failure'));
  const second = await guardian.reconcile();
  assert(second.changes.some(x => x.plugin === 'dsh-fixture-load-failure' && x.status === 'quarantined'));
  assert(second.changes.some(x => x.plugin === 'dsh-fixture-dependent' && x.status === 'quarantined'));
  const conflict = first.changes.find(x => x.plugin === losingService);
  await assert.rejects(guardian.restore(conflict.id), /冲突仍存在/);
  // Repair is confined to this disposable Host process, then use the real enable operation.
  process.env.DSH_TOOLKIT_FAULT_REPAIRED = '1';
  const restored = [];
  for (const name of ['dsh-fixture-load-failure', 'dsh-fixture-dependent']) {
    restored.push(await guardian.restore(second.changes.find(x => x.plugin === name).id));
  }
  const phasesAfterRestore = (await manager.listPlugins()).filter(x => x.moduleName.startsWith('dsh-fixture-'));
  assert.equal(phasesAfterRestore.find(x => x.moduleName === 'dsh-fixture-load-failure')?.fiberPhase, 'active');
  assert.equal(phasesAfterRestore.find(x => x.moduleName === 'dsh-fixture-dependent')?.fiberPhase, 'active');
  await manager.setBundleEnabled('dsh-fixture-old-api', true);
  const removal = await guardian.reconcile('remove');
  const removed = removal.changes.find(x => x.plugin === 'dsh-fixture-old-api');
  assert(removed, 'uninstall path must execute');
  assert.equal(removed.status, 'removed', JSON.stringify({ status: removed.status, error: removed.error, result: removed.result }));
  assert(!(await manager.listBundles()).some(x => x.name === 'dsh-fixture-old-api' && x.installed));
  const publicChanges = changes => changes.map(({ snapshot, ...x }) => ({ ...x, backupFiles: Object.keys(snapshot.files) }));
  return { ok: true, runtime: '0.2.0-rc.2', initial, winningService, losingService, preview, first: publicChanges(first.changes), second: publicChanges(second.changes),
    conflictRestoreRejected: true, restored: publicChanges(restored), phasesAfterRestore, removal: publicChanges(removal.changes),
    surviving: (await manager.listBundles()).filter(x => x.name.startsWith('dsh-fixture-')).map(x => ({ name: x.name, enabled: x.enabled, installed: x.installed })),
    profile: join(ctx.profileContext.dir, 'package.json') };
}
