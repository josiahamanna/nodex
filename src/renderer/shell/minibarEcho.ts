/** Minibuffer (M-x) result echo: commands dispatch this so output appears under the input bar. */

export const NODEX_MINIBAR_OUTPUT_EVENT = "nodex-minibar-output";

export type NodexMinibarEchoDetail = {
  text: string;
  kind?: "info" | "error";
};

export function emitNodexMinibarOutput(
  text: string,
  kind: NodexMinibarEchoDetail["kind"] = "info",
): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<NodexMinibarEchoDetail>(NODEX_MINIBAR_OUTPUT_EVENT, {
        detail: { text, kind },
      }),
    );
  } catch {
    /* ignore */
  }
}
