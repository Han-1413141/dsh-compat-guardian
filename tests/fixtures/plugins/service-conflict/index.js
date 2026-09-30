export function apply(ctx) {
  // A real duplicate provider, not just metadata that says a conflict exists.
  ctx.reflect.provide('fixtureSharedParser', { owner: 'service-conflict' });
}
