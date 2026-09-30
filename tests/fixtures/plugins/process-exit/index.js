export function apply() {
  if (process.env.DSH_TOOLKIT_ALLOW_FATAL_FIXTURE !== '1') throw new Error('Fatal fixture requires an isolated test host');
  process.exit(73);
}
