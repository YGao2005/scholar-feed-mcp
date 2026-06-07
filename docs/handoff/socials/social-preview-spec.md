# GitHub Social Preview Image Spec

A spec for the 1280x640 image GitHub shows when the repo link is shared on X, Slack, Discord, LinkedIn, and in search/social cards. This is the single highest-leverage brand asset for the launch: it is the thumbnail every link unfurls into.

## Why these dimensions

GitHub renders the social preview at a 1.91:1 aspect ratio. 1280x640 is the recommended size (the minimum is 640x320 at the same ratio). Export as PNG (text and the logo stay sharp; JPG would soften the edges of the bar-logo). Keep the file under 1 MB; the hard ceiling GitHub accepts is 5 MB.

Note: social cards get cropped differently across platforms. Keep all text and the logo inside a safe area with at least 80px of padding on every edge, and do not put anything load-bearing in the outer 60px.

## Source assets to use

From `assets/`:

- `logo-light.svg` (or `logo-light.png`, 400x400) for the mark on a dark background. The logo is a stacked-bar "S" in white on the dark variant.
- `logo-dark.svg` / `logo-dark.png` is the black-on-light variant. Only use this if you choose the light-background layout below.
- `icon.png` (400x400) is the same mark sized for an app icon; use `logo-light`/`logo-dark` for the preview, not `icon.png`.

The SVGs are vector, so prefer them when building in Figma or any vector tool: they scale to any size with no blur. The PNGs are 400x400, fine if placed at or below 200px on the canvas.

## Layout (recommended: dark background)

Canvas: 1280x640, solid dark background (near-black, e.g. `#0D1117`, GitHub's own dark canvas color, so the image feels native on the repo page).

```
+---------------------------------------------------------------+
|  [80px padding]                                               |
|                                                               |
|   [logo-light, ~140x140, top-left]                            |
|                                                               |
|   Scholar Feed MCP                       <- product name,     |
|                                             ~72px bold        |
|                                                               |
|   Search 600,000+ CS/AI/ML papers        <- tagline,         |
|   without leaving Claude Code or Cursor.    ~32px regular,    |
|                                             muted gray        |
|                                                               |
|   25 tools  .  600,000+ papers  .  anonymous or free key      |
|                                          <- fact strip,       |
|                                             ~24px, mono       |
|                                                               |
|   github.com/YGao2005/scholar-feed-mcp   <- bottom-left,      |
|                              [80px padding]  ~22px mono, muted |
+---------------------------------------------------------------+
```

Left-aligned everything. The logo sits top-left; name, tagline, fact strip, and repo URL stack down the left two-thirds. The right third stays empty (or holds a faint, large, low-opacity copy of the bar-logo as a watermark if you want texture). Empty space reads as confident; do not fill it with stock art.

## Exact copy (use verbatim)

- Product name: `Scholar Feed MCP`
- Tagline (one line, or wrap to two as drawn above): `Search 600,000+ CS/AI/ML papers without leaving Claude Code or Cursor.`
- Fact strip (use middots or vertical bars as separators, never dashes): `25 tools  .  600,000+ papers  .  anonymous or free key`
- Footer: `github.com/YGao2005/scholar-feed-mcp`

Do not add superlatives, "the best," exclamation points, or hype words. The facts carry it.

## Type and color

- Headline/name: a clean grotesque (Inter, Helvetica Neue, or system sans), bold weight.
- Body/tagline: same family, regular weight, muted gray (e.g. `#8B949E`) so the name stays dominant.
- Fact strip and footer: a monospace (JetBrains Mono, SF Mono, or any mono) to read as "this is a dev tool."
- Keep to two type sizes of contrast minimum so the name clearly wins the hierarchy.

If you prefer a light background, swap to `logo-dark`, use a near-white canvas (`#FFFFFF` or `#F6F8FA`), dark text (`#1F2328`), and a muted gray for the tagline. The dark layout is recommended because it matches how the mark was designed (the light logo is the white-on-dark variant) and looks better unfurled in dark-mode clients.

## How to produce it

Build the canvas in Figma, Canva (it has a 1280x640 GitHub-preview template), or any tool, then export PNG at exactly 1280x640. Drop the vector `logo-light.svg` in directly. Confirm the export is under 1 MB.

Suggested filename: `assets/social-preview.png` (committing it to the repo keeps it versioned alongside the other brand files).

## Where to upload it on GitHub

Repository home -> `Settings` (top tab) -> `General` (default page) -> scroll to the `Social preview` section -> `Edit` / `Upload an image` -> select the 1280x640 PNG.

The change is immediate on GitHub. External caches (X, Slack, Discord, LinkedIn) hold the old card for a while; to force a refresh, run the link through the platform's card debugger/validator after uploading, or just wait a few hours before the first launch post.

## Pre-launch checklist

- [ ] Exported at exactly 1280x640, PNG, under 1 MB.
- [ ] Name, tagline, fact strip, and URL are all inside the 80px safe area.
- [ ] Numbers match ground truth: 25 tools, 600,000+ papers.
- [ ] No dashes used as punctuation anywhere in the copy.
- [ ] Uploaded via Settings -> General -> Social preview.
- [ ] Pasted the repo link into a throwaway DM/channel to confirm the card unfurls correctly.
