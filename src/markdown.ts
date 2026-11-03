// Models also use LaTeX's \(...\) and \[...\]. remark-math expects $/$$.
// Preserve fenced and inline code verbatim, including examples of math syntax.
export function mathMarkdown(text: string) {
  return text
    .split(/(`{3,}[^\n]*\n[\s\S]*?`{3,}|~{3,}[^\n]*\n[\s\S]*?~{3,}|`+[^`]*`+)/g)
    .map((part, index) =>
      index % 2
        ? part
        : part
            .replace(
              /\\\[([\s\S]*?)\\\]/g,
              (_, value: string) => `\n$$\n${value.trim()}\n$$\n`,
            )
            .replace(
              /\\\(([\s\S]*?)\\\)/g,
              (_, value: string) => `$${value.trim()}$`,
            ),
    )
    .join("");
}
