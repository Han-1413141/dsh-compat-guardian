export const inject = ['tools'];
export function apply(ctx) {
  // Deliberately absent API; simulates a removed API, not a claim about DSH history.
  ctx.tools.registerLegacyTool({ name: 'fixture_old_tool' });
}
