declare module "@observablehq/runtime" {
  export class Runtime {
    module(): {
      variable: (observer?: unknown) => {
        define: (
          name: string,
          inputs: string[],
          definition: (...args: unknown[]) => unknown,
        ) => unknown;
      };
    };
    dispose(): void;
  }

  export const Inspector: {
    into: (node: Element) => (name?: string) => unknown;
  };
}
