---
name: doc
description: Write Markdown documents in the MDWisp portable document-folder format, including reports, plans, notes, tutorials and designs, or add images to an existing document. Supports no-image and image-rich modes.
---

# Write a portable document folder

Create a **folder containing the document and its images**. Copying that folder to another machine must preserve every image.

## Format

```text
Notes/
├── Notes.md
└── Notes_img/
    ├── architecture.svg
    └── sequence.png
```

```markdown
![Architecture](./Notes_img/architecture.svg)
```

The folder name, Markdown filename and `_img` prefix must match.

- Omit `_img` when there are no images; keep the Markdown file inside its matching folder.
- Use the user's chosen location, or the current working directory when none was specified.
- When adding images to an existing document, use its adjacent `DocumentName_img/` folder without moving the document.
- If the destination folder already exists, ask whether to rename or use it; do not overwrite it.

## Image modes

Infer the mode from the request. Default to image-rich when unspecified.

### No images

Use this for requests such as “no images” or “text only”. Do not create `_img`, image syntax or missing-image placeholders. Use tables, lists or diagrams inside fenced code blocks instead.

### Image-rich

Illustrate flows, architecture, hierarchy, sequence, states, comparisons, data trends and layouts where an image explains them better. Each image must convey useful information; avoid decorative images.

| Image type | Method |
| --- | --- |
| Structure, flow, relationships, schematics | Write SVG directly; this is the default |
| Accurate charts with many data points | Generate SVG or PNG with a plotting library; store only images, not scripts, in the document folder |
| Real interfaces or output | Take actual screenshots when tools and a running target are available; otherwise make an SVG wireframe and label it as illustrative |
| Photos, illustrations, realistic imagery | Use an available image generation tool and save its output; otherwise omit the image and disclose what is missing |

When uncertain about a complex image, create a useful SVG first and explain possible replacements at delivery.

## Three prohibitions

1. No absolute image paths such as `C:\Users\...`, `/home/me/...` or `file:///...`.
2. No base64 image data unless explicitly requested; explain the exception.
3. Do not upload generated images to external hosting. Existing remote images may be referenced, but their links may expire.

Describing an intended image without creating it does not count as illustrating the document.

## Paths and names

- Start paths with `./` and use `/` separators on every platform.
- Use meaningful filenames, such as `login-flow.svg`, rather than `image1.png`. Chinese names are allowed.
- Avoid spaces, parentheses and `# ? % : * " < > |`. Separate words with hyphens.
- Write paths literally without URL encoding.
- Reuse identical files. For different content with the same name, add a suffix such as `architecture-2.svg`; overwrite only with explicit permission in this conversation.
- Write meaningful alt text describing what each image conveys.

## SVG

- Set `viewBox`, width and height; do not depend on external CSS.
- Include CJK font fallbacks, such as `'PingFang SC', 'Microsoft YaHei UI', 'Noto Sans SC', sans-serif`.
- Keep SVG self-contained: no remote images, external fonts or `@import`.
- Keep labels short and leave enough room to prevent overflow.
- Use a solid background that works independently of the document theme.

## Writing

- YAML front matter such as `title` and `tags` is optional.
- Use one H1 per document and do not skip heading levels.
- Label code fences with their language.
- Image syntax inside fenced or inline code is an example, not a file reference.

## Validate before delivery

Run the validator in this skill's directory:

```bash
node scripts/check.mjs "<document-folder-or-markdown-path>"
```

Add `--no-images` for no-image mode. Fix all errors before delivery. The script checks folder shape, relative image paths, file existence, unused images and self-contained SVGs.

Report the document folder path, image count and any images omitted because a tool was unavailable.
