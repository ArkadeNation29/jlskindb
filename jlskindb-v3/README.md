# JL-Mod Skins Database

A small static database of skins for the [JL-Mod](https://github.com/woesss/JL-Mod) J2ME emulator, plus a list of J2ME games translated to Indonesian. No build step, no framework — plain HTML/CSS/JS hosted on GitHub Pages.

## Adding a skin

1. Put the skin image in `skins/` and a thumbnail in `thumb/`.
2. Create `cards/<id>.json`:

```json
{
  "id": "asphalt-6-adrenaline",
  "title": "Asphalt 6: Adrenaline",
  "author": "ArkadeNation29",
  "resolution": "480x800",
  "orientation": "landscape",
  "category": "game",
  "thumbnail": "thumb/asphalt6_thumb.jpg",
  "download": "skins/Asphalt6AdrenalineLS.png",
  "tags": ["asphalt", "game"],
  "description": "A skin frame for touchscreen 480x800 games inspired by Asphalt 6: Adrenaline.",
  "dateAdded": "2026-04-25"
}
```

`orientation`: `portrait`, `landscape` or `both`. `category`: `device`, `game`, `console` or `custom`. `download` can be a relative path or an external URL. Skins added in the last 14 days get a "New" badge.

## Adding a translated game

Drop the `.jar` into `tl/`. That's it — the list is generated from the folder. The title, device and resolution are read from the filename, so any of these work:

```
Asphalt 6 Adrenaline-240x320.jar
Prince of Persia-Nokia N73-240x320.jar
Prince_of_Persia_N73_240x320.jar
Diamond Rush - 128x160 - Nokia 5130.jar
Tom Clancy 176x208 N70.jar
```

## How the index files are built

The site reads `cards/index.json` and `tl/index.json`. Both are generated automatically by the GitHub Action in `.github/workflows/build-index.yml` whenever something in `cards/` or `tl/` changes on `main`. The workflow commits the updated index files back to the repo.

To build them locally (for example when previewing with `python -m http.server`):

```
node scripts/build-index.js
```

If `tl/index.json` is ever missing, the site falls back to listing the `tl/` folder through the GitHub API when hosted on `*.github.io`.
