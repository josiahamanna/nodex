/**
 * Virtual `@nodex/*` modules for MDX: implementations live in-app; imports are stripped at compile time
 * and JSX resolves via {@link getNodexMdxFacadeComponentMap}.
 */
export const NODEX_MDX_FACADE_IMPORTS = ["@nodex/ui", "@nodex/date"] as const;

export type NodexMdxFacadeId = (typeof NODEX_MDX_FACADE_IMPORTS)[number];
