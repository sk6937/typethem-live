# typethem-live

**Generated deploy artifact — do not hand-edit.** This repository is the static
build of [TypeThem](https://typethem.com), produced by exporting the WordPress
source (in the `typethem` repo) through Simply Static with absolute
`https://typethem.com` URLs. Hostinger's Git Deploy pulls this repo's root
directly into `public_html`, so `index.html` and `.htaccess` live at the root.

## Deploying an update

1. In the `typethem` WordPress project, make content/template changes.
2. Re-run the Simply Static export (`destination_url_type = absolute`).
3. Sync the fresh `static-export/` over this repo's root, keep `.htaccess`,
   commit, and push. Hostinger auto-pulls on push (if auto-deploy is enabled).

Everything here is regenerated from source; the source of truth is the WordPress
repo, never this one.
