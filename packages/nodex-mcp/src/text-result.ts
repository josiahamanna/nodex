/** MCP tool handler return shape (subset of CallToolResult). */
export type ToolReturn = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export function jsonResult(obj: unknown): ToolReturn {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(obj, null, 2),
      },
    ],
  };
}

export function errorResult(message: string): ToolReturn {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
