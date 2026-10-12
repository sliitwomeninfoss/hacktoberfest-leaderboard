// Builds site/data/leaderboard.json from GitHub activity in the configured repos.
// Usage: GITHUB_TOKEN=... node scripts/build-leaderboard.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../config.json", import.meta.url), "utf8"));
const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

const start = new Date(config.start);
const end = new Date(config.end);
const P = config.points;
const day = (d) => d.toISOString().slice(0, 10);
const inWindow = (iso) => iso && new Date(iso) >= start && new Date(iso) <= end;
const excluded = new Set(config.exclude.map((l) => l.toLowerCase()));

async function graphql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(JSON.stringify(body.errors ?? body));
  return body.data;
}

async function searchAll(q, fragment) {
  const nodes = [];
  let after = null;
  do {
    const data = await graphql(
      `query($q: String!, $after: String) {
        search(query: $q, type: ISSUE, first: 50, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { ${fragment} }
        }
      }`,
      { q, after }
    );
    nodes.push(...data.search.nodes);
    after = data.search.pageInfo.hasNextPage ? data.search.pageInfo.endCursor : null;
  } while (after);
  return nodes;
}

const PR_FIELDS = `... on PullRequest {
  number url mergedAt
  author { login avatarUrl url __typename }
  labels(first: 20) { nodes { name } }
  commits { totalCount }
  files(first: 100) { nodes { path additions deletions } }
  closingIssuesReferences(first: 20) { nodes { number repository { nameWithOwner } } }
  reviews(first: 50) { nodes { author { login avatarUrl url __typename } submittedAt } }
}`;

const ISSUE_FIELDS = `... on Issue {
  number createdAt stateReason
  author { login avatarUrl url __typename }
  labels(first: 20) { nodes { name } }
}`;

const globToRegex = (glob) =>
  new RegExp("(^|/)" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");
const ignored = config.ignoreFiles.map(globToRegex);
const isIgnored = (path) => ignored.some((re) => re.test(path));

const people = new Map();
function person(author) {
  if (!author || author.__typename === "Bot" || author.login.endsWith("[bot]")) return null;
  if (excluded.has(author.login.toLowerCase())) return null;
  if (!people.has(author.login)) {
    people.set(author.login, {
      login: author.login,
      avatarUrl: author.avatarUrl,
      url: author.url,
      prs: 0,
      commits: 0,
      linesChanged: 0,
      sizeBonus: 0,
      issuesResolved: new Set(),
      issuesReported: 0,
      reviewedPrs: new Set(),
    });
  }
  return people.get(author.login);
}

const hasExcludedLabel = (item) =>
  item.labels.nodes.some((l) => config.excludeLabels.includes(l.name.toLowerCase()));

for (const repo of config.repos) {
  const prs = await searchAll(
    `repo:${repo} is:pr is:merged merged:${day(start)}..${day(end)}`,
    PR_FIELDS
  );

  for (const pr of prs) {
    if (!inWindow(pr.mergedAt) || hasExcludedLabel(pr)) continue;
    const p = person(pr.author);
    if (p) {
      const lines = pr.files.nodes
        .filter((f) => !isIgnored(f.path))
        .reduce((sum, f) => sum + f.additions + f.deletions, 0);
      p.prs += 1;
      p.commits += pr.commits.totalCount;
      p.linesChanged += lines;
      // log scale: ~10 lines = 1.7, ~100 lines = 3.3, 1000+ lines = capped
      p.sizeBonus += Math.min(P.maxSizeBonus, Math.log2(1 + lines) / 2);
      for (const issue of pr.closingIssuesReferences.nodes) {
        p.issuesResolved.add(`${issue.repository.nameWithOwner}#${issue.number}`);
      }
    }
    for (const review of pr.reviews.nodes) {
      if (!inWindow(review.submittedAt) || review.author?.login === pr.author?.login) continue;
      person(review.author)?.reviewedPrs.add(`${repo}#${pr.number}`);
    }
  }

  const issues = await searchAll(
    `repo:${repo} is:issue created:${day(start)}..${day(end)}`,
    ISSUE_FIELDS
  );
  for (const issue of issues) {
    if (!inWindow(issue.createdAt) || hasExcludedLabel(issue)) continue;
    if (issue.stateReason !== "COMPLETED") continue;
    const p = person(issue.author);
    if (p) p.issuesReported += 1;
  }
}

const round1 = (n) => Math.round(n * 10) / 10;

const contributors = [...people.values()]
  .map((p) => {
    const reviews = Math.min(p.reviewedPrs.size, P.maxReviews);
    const reported = Math.min(p.issuesReported, P.maxIssuesReported);
    const breakdown = {
      prs: p.prs * P.mergedPr,
      size: round1(p.sizeBonus),
      commits: round1(P.commitWeight * Math.sqrt(p.commits)),
      issuesResolved: p.issuesResolved.size * P.issueResolved,
      issuesReported: reported * P.issueReported,
      reviews: reviews * P.review,
    };
    const score = Math.round(Object.values(breakdown).reduce((a, b) => a + b, 0));
    return {
      login: p.login,
      avatarUrl: p.avatarUrl,
      url: p.url,
      prs: p.prs,
      commits: p.commits,
      linesChanged: p.linesChanged,
      issuesResolved: p.issuesResolved.size,
      issuesReported: p.issuesReported,
      reviews: p.reviewedPrs.size,
      score,
      breakdown,
    };
  })
  .filter((c) => c.score > 0)
  .sort((a, b) => b.score - a.score || b.prs - a.prs || a.login.localeCompare(b.login));

const out = {
  event: config.event,
  repos: config.repos,
  start: config.start,
  end: config.end,
  points: P,
  generatedAt: new Date().toISOString(),
  contributors,
};

await mkdir(new URL("../site/data/", import.meta.url), { recursive: true });
await writeFile(new URL("../site/data/leaderboard.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(`Wrote ${contributors.length} contributors`);
