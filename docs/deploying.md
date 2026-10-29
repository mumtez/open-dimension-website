# Deploying

The site is public at https://open-dimension.com, served by GitHub Pages from this public repo. Pushing to `main` deploys it (`.github/workflows/deploy.yml`, about a minute). The workflow publishes only what `npm run build` assembles into `_site/`: `index.html` and every file it references. The smoke test serves that same `_site/`.

## Rules for publishing steps

- **Run each outward-facing step on its own** and verify it before the next: visibility changes, force-pushes, DNS or domain changes. Never chain one after another command that might fail.
- **Commit email**: this repo is public, so every commit uses the GitHub noreply address (`144554789+mumtez@users.noreply.github.com`, set as the repo's local `user.email`). `npm run check` and the pre-push hook run `scripts/check-emails.mjs` and fail on anything else.
- **Secrets**: GitHub secret scanning and push protection are enabled for the repo.

## Domain

- Registrar and DNS: Name.com. Records: four A records on the root (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`) and a `www` CNAME to `mumtez.github.io`. Name.com's form leaves Host blank for the root.
- Custom domain and HTTPS are set through the Pages API (`gh api -X PUT repos/mumtez/open-dimension-website/pages -f cname=open-dimension.com`, later `-F https_enforced=true`).

## Gotchas

- **The HTTPS certificate may not start on its own.** If `gh api repos/mumtez/open-dimension-website/pages --jq .https_certificate` stays `null` after DNS resolves, clear the custom domain (`-F cname=`), set it again, and wait a minute or two.
- **A visitor or a home network can see the old parking page for hours** after a DNS change (cached answer). Test with `curl --resolve open-dimension.com:443:185.199.108.153 https://open-dimension.com/` to bypass the cache.
- **Contact**: the page says "coming soon" until the owner supplies a real address.
