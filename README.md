# Commit or Treat

Hacktoberfest leaderboard for [SLIIT Women in FOSS](https://github.com/sliitwomeninfoss). It scores contributions made from **12 October 2026** onwards (earlier work doesn't count) to the repos listed in `config.json` and publishes a static page to GitHub Pages.

**Live:** https://sliitwomeninfoss.github.io/hacktoberfest-leaderboard/

## How scoring works

Only work that lands counts, and the PR or issue itself must be opened on or after the start date: merged PRs, issues those PRs close, completed issues, and reviews on merged PRs. Volume is dampened so many small commits can't outrank one solid PR.

| Activity | Points |
|---|---|
| Merged PR | 10 each |
| PR size bonus | `min(2, log2(1 + lines changed) / 5)` per PR (10 lines = 0.7, 100 = 1.3, 1000+ = 2). Lockfiles and minified files are ignored |
| Commits (in merged PRs) | `3 x sqrt(total commits)` |
| Issue resolved (closed by your merged PR via `Closes #n`) | 6 each |
| Issue reported (opened by you, closed as completed) | 2 each, max 5 issues |
| Review on someone else's merged PR | 2 per PR, max 10 PRs |

```
score = 10 x PRs
      + sum( min(2, log2(1 + lines) / 5) )   per PR
      + 3 x sqrt(commits)
      + 6 x issues resolved
      + 2 x min(5, issues reported)
      + 2 x min(10, PRs reviewed)
```

PRs or issues labelled `invalid` or `spam` are ignored, and so are bots. Everything is configurable in `config.json`: repos, date window, excluded users and point values.

## How it runs

The `Build and deploy leaderboard` workflow runs every 6 hours, on every push to `main`, and on demand from the Actions tab. It runs `scripts/build-leaderboard.mjs`, which queries the GitHub GraphQL API and writes `site/data/leaderboard.json`, then deploys `site/` to Pages. Generated data isn't committed.

## Run locally

Requires Node 20+ and the GitHub CLI (or any token with public repo read access).

```sh
GITHUB_TOKEN=$(gh auth token) node scripts/build-leaderboard.mjs
python -m http.server 8787 --directory site
```

Then open http://localhost:8787.
