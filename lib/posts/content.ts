import "server-only";

export function tiptapDocumentToPlainText(value: unknown) {
  if (!value || typeof value !== "object" || !("content" in value)) return "";
  const { content } = value;
  if (!Array.isArray(content)) return "";

  function collectText(node: unknown): string {
    if (!node || typeof node !== "object") return "";

    if ("type" in node && node.type === "text" && "text" in node) {
      return typeof node.text === "string" ? node.text : "";
    }

    if ("content" in node && Array.isArray(node.content)) {
      const separator =
        "type" in node &&
        ["blockquote", "bulletList", "orderedList", "listItem"].includes(
          String(node.type),
        )
          ? "\n"
          : "";
      return node.content.map(collectText).join(separator);
    }

    return "";
  }

  return content.map(collectText).join("\n");
}
