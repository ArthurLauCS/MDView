---
name: share
description: Export a Markdown document with local images as a shareable standalone file without local images or paths, while preserving the original document.
---

# Export a shareable document

Make a Markdown file readable on its own without damaging the original.

## Processing rules

Remove local image references, local paths in HTML media, local file links, and private editor fields in front matter such as `mdview:`.

Preserve remote images, `data:` images, remote links, anchor links, and all remaining prose, lists, tables and quotes.

Never modify content inside fenced code blocks or inline code. Image syntax there is an example. Match backtick and tilde fences separately, including longer fences such as four backticks.

## Image policy

Ask whether to discard image references or keep placeholders containing their alt text. Honor an explicit preference; otherwise follow project settings. If neither exists, use placeholders and disclose this at delivery.

## Preview before writing

Before writing, list every removed line with its line number, original text and reason. Write the result after the user confirms. Avoid vague summaries that conceal what was removed.

## Preserve formatting

- Process line by line. Do not parse and reserialize the entire document, which can change formatting and list markers.
- Preserve blank lines, indentation and table pipe alignment.
- Do not add an export attribution to the document.

## Final checks

1. Code block contents exactly match the original.
2. Every removed line has a specific reason.
3. No absolute paths, drive letters or `file://` references remain outside preserved code examples.
4. Remote links and `data:` images remain unchanged.
