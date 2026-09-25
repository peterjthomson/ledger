# Ledger App Store brand assets

This folder contains a coherent, production-sized asset set for Ledger's Mac App Store listing.

## Final exports

- `screenshots/`: five 2880 × 1800 PNG screenshots in recommended listing order
- `brand/ledger-app-icon-1024.png`: current production icon master
- `brand/ledger-wordmark-dark.png`: 1600 × 400 dark wordmark lockup
- `brand/ledger-wordmark-light.png`: 1600 × 400 light wordmark lockup
- `brand/ledger-social-card-2400x1260.png`: reusable launch/announcement card
- `icon-composer/`: three unmasked, full-square vector layers for Apple's Icon Composer
- `backgrounds/git-graph-campaign.png`: shared generated campaign backdrop
- `raw/`: real 2880 × 1800 Ledger UI captures used in the listing artwork
- `app-store-contact-sheet.png` and `brand-contact-sheet.png`: quick visual QA previews

The five listing screenshots contain no transparency and use one of Apple's accepted 16:10 Mac screenshot sizes.

## Screenshot order and copy

1. **Your whole Git workspace. One view.**
   Branches, worktrees, pull requests, commits, remotes, and stashes—always in context.
2. **Stage, commit, and push without breaking flow.**
   Move from graph to working changes in one focused workspace.
3. **Review pull requests in context.**
   Conversation, files, commits, and merge controls stay side by side.
4. **See risk before the review starts.**
   AI-assisted signals highlight oversized changes and missing review hygiene.
5. **Trace every branch, cleanly.**
   A full-screen commit graph makes divergence, merges, and releases easy to scan.

## Regenerate the composed assets

Build or capture new files in `raw/`, keep the filenames used by the renderer, then run:

```bash
node scripts/render-app-store-assets.mjs
```

The renderer preserves the 2880 × 1800 output size and writes RGB PNG files.

To refresh the PNG copies of the Icon Composer vectors and their flat preview:

```bash
for file in docs/app-store/icon-composer/0*.svg; do
  magick -background none "$file" "${file%.svg}.png"
done

magick \
  docs/app-store/icon-composer/01-background.png \
  docs/app-store/icon-composer/02-rails.png \
  -compose over -composite \
  docs/app-store/icon-composer/03-branch.png \
  -compose over -composite \
  docs/app-store/icon-composer/ledger-icon-layered-preview.png
```

## Icon Composer layers

Import these back-to-front:

1. `01-background.svg`
2. `02-rails.svg`
3. `03-branch.svg`

The layers intentionally use a square canvas without a pre-applied rounded mask. Apple applies the platform mask and appearance effects.

The existing Electron `resources/build/icon.png` and `resources/build/icon.icns` remain unchanged.

## Campaign background prompt

Built-in image generation was used for the shared background with this prompt:

> Use case: stylized-concept. Asset type: shared Mac App Store screenshot campaign background for a macOS developer tool. Create an elegant abstract visual metaphor for git branches, commits, and worktrees: sparse connected rails and rounded nodes flowing through depth, inspired by a commit graph but not resembling any existing brand or app interface. Use a deep charcoal-to-graphite atmospheric gradient with subtle structure concentrated near the outer edges and lower corners and a broad clean central area for an app window overlay. Premium minimal 3D illustration, matte surfaces, soft glass highlights, crisp geometry, and macOS-quality polish. Exact wide 16:10 landscape composition. Near-black, graphite, soft white, with restrained sky blue, coral, teal, and amber accents. No words, letters, numbers, logos, trademarks, watermark, UI screenshots, device mockups, or Apple hardware.

## Apple references

- Screenshot specification: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- App icon guidance: https://developer.apple.com/design/human-interface-guidelines/app-icons/

## Current review blockers

See [the 1.5.1 rejection and resubmission gates](review-1.5.1.md).
A passing GitHub package is not evidence that the sandboxed MAS build passes.
