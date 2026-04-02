export type NotebookSandboxInvoke = (
  commandId: string,
  args?: Record<string, unknown>,
) => void | Promise<void>;

let invoker: NotebookSandboxInvoke | undefined;

export function setNotebookSandboxCommandInvoker(fn: NotebookSandboxInvoke | undefined): void {
  invoker = fn;
}

export function getNotebookSandboxCommandInvoker(): NotebookSandboxInvoke | undefined {
  return invoker;
}
