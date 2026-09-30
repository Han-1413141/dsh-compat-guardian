// Reproduces the removed named-export failure reported in upstream discussion #5599.
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
export function apply() { return settingsNamespace; }
