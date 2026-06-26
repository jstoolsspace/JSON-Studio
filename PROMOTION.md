# Where to list JSON Studio

A submission checklist for a free, open-source, cross-platform desktop app.
Priority is roughly top-to-bottom within each section.

## 1. Package managers / repositories (highest value — this is how people install)

These get you real installs and "one command to install" credibility.

### Windows
- **winget** (Microsoft official) — submit a manifest PR to `microsoft/winget-pkgs`. https://github.com/microsoft/winget-pkgs
- **Scoop** — add a manifest to a bucket (or your own). https://scoop.sh
- **Chocolatey** — package + submit. https://community.chocolatey.org/packages/upload

### macOS
- **Homebrew Cask** — submit a cask PR to `homebrew/homebrew-cask`. https://github.com/Homebrew/homebrew-cask

### Linux
- **Flathub** (Flatpak) — the main Linux app store; submit to `flathub/flathub`. https://flathub.org
- **Snap Store** — publish via Snapcraft. https://snapcraft.io
- **AUR** (Arch User Repository) — submit a PKGBUILD. https://aur.archlinux.org

## 2. Software directories (SEO + discovery, listings are permanent)

- **AlternativeTo** — list it as an alternative to JSON viewers/editors; great for capturing people searching for competitors. https://alternativeto.net
- **SourceForge** — large open-source directory + mirror hosting for downloads. https://sourceforge.net
- **Slant** — community-driven "best X" comparisons. https://www.slant.co
- **SaaSHub** — software alternatives & directory. https://www.saashub.com
- **OpenSourceFest** — curated open-source alternatives; editors review within ~48h. https://opensourcefest.org
- **Open Source Software Directory (OSSD)** — https://opensourcesoftwaredirectory.com

## 3. Launch / discovery platforms (traffic spike on launch day)

- **Hacker News** — "Show HN: JSON Studio – a lossless local JSON workspace". Highest-quality dev traffic if it lands. https://news.ycombinator.com/show
- **Product Hunt** — schedule a launch with good assets. https://www.producthunt.com
- **Lobsters** — dev-focused link aggregator (needs an invite). https://lobste.rs
- **Indie Hackers** — https://www.indiehackers.com
- **Uneed** — Product Hunt alternative, free + paid slots. https://www.uneed.best
- **Fazier** — https://fazier.com
- **StartupBase** — https://startupbase.io
- **BetaList** — for newer products. https://betalist.com
- **dev.to** — write a launch/"how I built it" post. https://dev.to

## 4. Reddit communities (post a "Show", read each sub's self-promo rules first)

- **r/json** — directly on topic. https://reddit.com/r/json
- **r/coolgithubprojects** — https://reddit.com/r/coolgithubprojects
- **r/opensource** — https://reddit.com/r/opensource
- **r/programming** / **r/webdev** / **r/dataengineering** — relevant audiences for a JSON tool
- **r/rust** + **r/tauri** — since it's built with Tauri/Rust, the community appreciates these
- **r/coolguides / r/software** — general software discovery

## 5. Curated "awesome" lists (PRs — long-term, evergreen discovery)

- **awesome-tauri** — apps built with Tauri. https://github.com/tauri-apps/awesome-tauri
- **awesome-opensource-apps** — https://github.com/unicodeveloper/awesome-opensource-apps
- **awesome-json** — search GitHub for the current maintained list and open a PR
- **definitive-opensource** — https://github.com/mustbeperfect/definitive-opensource

## Before you submit — prep these once

- A clear one-line description (see `DESCRIPTION.md`).
- 2–4 screenshots + ideally a short GIF/video of the tree, search, and diff.
- An app icon / logo (you already have one).
- Installers attached to a **GitHub Release** with checksums (your `v1.0.0` release).
- A homepage URL (GitHub repo is fine to start).
- License clearly stated (open source).

## 6. Freeware download portals (sites with free software catalogs)

These are the classic "download free software" sites. Most let you submit via a
"Submit software" form or by contacting an editor. **Reputation matters:** for an
open-source app, prefer portals that serve your original installer untouched and
avoid ones known for wrapping downloads in their own ad-loaded installer.

### Recommended (clean, respect original downloads)
- **FOSSHUB** — open-source focused, no bundles/adware; can also host your binaries. Best fit for an OSS tool. https://www.fosshub.com
- **Softpedia** — huge, editor-tested catalog; submit via their developer form. https://www.softpedia.com (submit: https://www.softpedia.com/get/scripts/submit/)
- **Uptodown** — large catalog incl. Windows; developer submission. https://en.uptodown.com
- **FileHippo** — popular, keeps current + older versions; submit via contact. https://filehippo.com
- **MajorGeeks** — carefully curated utilities; submit via their forum/contact. https://www.majorgeeks.com
- **SnapFiles** — long-running, clean freeware directory. https://www.snapfiles.com
- **TechSpot Downloads** — reputable, editor-reviewed. https://www.techspot.com/downloads/
- **Soft112 / Software Informer** — easy self-submission, auto-listed. https://soft112.com

### Use with caution (historically bundle/wrap installers)
- **Softonic** — big reach but has a history of bundled installers. https://en.softonic.com
- **CNET Download.com** — large audience, also historically bundled. https://download.cnet.com
- **FileForum (BetaNews)** — https://fileforum.com

> Tip: wherever a portal lets you, point the download button at your **GitHub
> Release asset** (or FOSSHUB mirror) so users always get your signed, unbundled
> installer. List the SHA-256 checksum in the description.

## 7. Open-source-focused directories (OSS catalogs & "open alternative" sites)

Dedicated to open-source software — usually free to list, SEO-friendly, and the
audience specifically wants OSS. Many accept a GitHub PR or a simple form.

- **GNU / FSF Free Software Directory** — the canonical free-software catalog (accepts only fully free/libre licenses). https://directory.fsf.org
- **OpenAlternative** — popular "open source alternatives to proprietary software" directory; submit via GitHub PR. https://openalternative.co · repo: https://github.com/piotrkulpinski/openalternative
- **AlternateOSS** — open-source alternatives directory. https://alternateoss.com
- **Libre Projects** — directory of open-source/libre web & desktop apps. https://libreprojects.net
- **awesomeopensource.com** — open-source project discovery by category. https://awesomeopensource.com
- **OpenSourceFest** — curated OSS alternatives, editor-reviewed (~48h). https://opensourcefest.org
- **Open Source Software Directory (OSSD)** — https://opensourcesoftwaredirectory.com
- **SourceForge** — still the largest OSS directory + free binary mirroring. https://sourceforge.net
- **Linux Foundation LFX Insights** — project index; you can submit projects not yet listed. https://insights.linuxfoundation.org
- **AlternativeTo** (filter: "Open Source" / "Free") — huge reach for alternative searches. https://alternativeto.net

### "Awesome" lists worth a PR (evergreen OSS discovery)
- **awesome-tauri** — apps built with Tauri (perfect match). https://github.com/tauri-apps/awesome-tauri
- **awesome-opensource-apps** — https://github.com/unicodeveloper/awesome-opensource-apps
- **definitive-opensource** — https://github.com/mustbeperfect/definitive-opensource
- **awesome-json** — search GitHub for the current maintained list and open a PR

> For the **Android** version (json-studio-mobile), the key OSS channel is
> **F-Droid** (https://f-droid.org) — the open-source Android app store. Worth
> targeting once the mobile app ships.

## Suggested order

1. Publish the GitHub Release (installers live).
2. Submit to winget + Homebrew Cask + Flathub (install channels).
3. Add to AlternativeTo, SourceForge, awesome-tauri (evergreen SEO).
4. Plan a launch day: Show HN + Product Hunt + relevant subreddits together.
