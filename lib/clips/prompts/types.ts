/** Prompt versionado: id estável + versão inteira + builder puro. */
export interface BuiltPrompt {
  system: string;
  user: string;
}

export interface ClipPrompt<TInput> {
  id: string;
  version: number;
  build(input: TInput): BuiltPrompt;
}
