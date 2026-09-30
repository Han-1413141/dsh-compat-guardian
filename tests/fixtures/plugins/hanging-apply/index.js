export async function apply() {
  if (process.env.DSH_TOOLKIT_ALLOW_FATAL_FIXTURE !== '1') throw new Error('Hanging fixture requires an isolated test host');
  return new Promise(() => {});
}
