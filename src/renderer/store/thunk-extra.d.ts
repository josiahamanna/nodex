import type { NodexPlatformDeps } from "@nodex/platform";

declare module "@reduxjs/toolkit" {
  interface AsyncThunkConfig {
    extra: NodexPlatformDeps;
  }
}

export {};
