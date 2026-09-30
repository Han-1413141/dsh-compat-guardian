export const inject = ['fixtureRecoveredParser'];
export function apply(ctx) {
  if (!ctx.fixtureRecoveredParser.ready) throw new Error('INJECTED_DEPENDENCY_FAILURE');
}
