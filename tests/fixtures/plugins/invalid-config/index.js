import Schema from '@deepseek-ai/schemastery';
export const Config = Schema.object({ port: Schema.number().required() });
export function apply() {}
