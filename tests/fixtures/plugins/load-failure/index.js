export function apply(ctx) {
  if (process.env.DSH_TOOLKIT_FAULT_REPAIRED !== '1') throw new Error('INJECTED_LOAD_FAILURE: fixture parser failed to initialize');
  ctx.reflect.provide('fixtureRecoveredParser', { ready: true });
}
