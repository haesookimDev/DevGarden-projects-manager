export type LlmProviderKind = 'codex-cli' | 'openai-compatible';

export interface LlmProvider {
  readonly kind: LlmProviderKind;
  readonly id: string;
}
