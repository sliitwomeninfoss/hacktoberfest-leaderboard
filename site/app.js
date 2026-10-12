(async function () {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  let data;
  try {
    const res = await fetch("data/leaderboard.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    $("#empty").hidden = false;
    $("#empty .empty-title").textContent = "The spirits are not answering.";
    $("#empty p:nth-child(2)").textContent = "Leaderboard data could not be loaded. Try again later.";
    return;
  }

  const list = data.contributors;
  const repo = data.repos[0];
  const repoUrl = `https://github.com/${repo}`;

  $("#event-name").textContent = data.event;
  $("#repo-link").href = repoUrl;
  $("#repo-link").textContent = data.repos.join(", ");
  $("#empty-cta").href = `${repoUrl}/issues`;
  document.querySelectorAll(".repo-anchor").forEach((a) => (a.href = `${repoUrl}/issues`));

  // countdown
  const end = new Date(data.end);
  const start = new Date(data.start);
  const now = new Date();
  const daysLeft = Math.ceil((end - now) / 86400000);
  $("#clock").textContent =
    now < start ? "OPENS OCT 1" : now > end ? "THE HUNT IS OVER" : `${daysLeft} ${daysLeft === 1 ? "NIGHT" : "NIGHTS"} LEFT`;

  // stats
  const sum = (key) => list.reduce((n, c) => n + c[key], 0);
  const stat = (k, v) => ($(`[data-stat="${k}"]`).textContent = v);
  stat("contributors", list.length);
  stat("prs", sum("prs"));
  stat("issues", sum("issuesResolved"));
  stat(
    "updated",
    new Date(data.generatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  );

  if (list.length === 0) {
    $("#empty").hidden = false;
  }

  const avatar = (url, size) => esc(`${url}${url.includes("?") ? "&" : "?"}s=${size}`);

  // podium
  $("#podium").innerHTML = list
    .slice(0, 3)
    .map(
      (c, i) => `
      <a class="grave rank-${i + 1}" href="${esc(c.url)}" target="_blank" rel="noopener">
        <span class="rank">RANK ${String(i + 1).padStart(2, "0")}</span>
        <img src="${avatar(c.avatarUrl, 168)}" alt="" loading="lazy">
        <span class="name">${esc(c.login)}</span>
        <span class="score">${c.score}<small>PTS</small></span>
      </a>`
    )
    .join("");

  // rows
  const top = list[0]?.score || 1;
  const plural = (n, word) => `<b>${n}</b> ${word}${n === 1 ? "" : "s"}`;
  const B = (label, value, note) => `<div><b>${value}</b>${label}${note ? ` (${note})` : ""}</div>`;

  $("#rows").innerHTML = list
    .map(
      (c, i) => `
      <li class="row" data-open="false">
        <button type="button" aria-expanded="false">
          <span class="pos">${String(i + 1).padStart(2, "0")}</span>
          <img src="${avatar(c.avatarUrl, 80)}" alt="" loading="lazy">
          <span class="who">
            <span class="login">${esc(c.login)}</span>
            <span class="meta">
              <span>${plural(c.prs, "PR")}</span>
              <span>${plural(c.issuesResolved, "issue")}</span>
              <span>${plural(c.commits, "commit")}</span>
              <span>${plural(c.reviews, "review")}</span>
            </span>
          </span>
          <span class="pts">
            <strong>${c.score}</strong>
            <span class="bar"><span style="width:${Math.max(4, (c.score / top) * 100)}%"></span></span>
          </span>
        </button>
        <div class="breakdown">
          ${B("merged PRs", c.breakdown.prs, `${c.prs} x ${data.points.mergedPr}`)}
          ${B("size bonus", c.breakdown.size, `${c.linesChanged} lines`)}
          ${B("commits", c.breakdown.commits, `${c.commits} commits`)}
          ${B("issues resolved", c.breakdown.issuesResolved)}
          ${B("issues reported", c.breakdown.issuesReported)}
          ${B("reviews", c.breakdown.reviews)}
          <div><a href="${esc(repoUrl)}/pulls?q=is%3Apr+is%3Amerged+author%3A${encodeURIComponent(c.login)}" target="_blank" rel="noopener">View PRs</a></div>
        </div>
      </li>`
    )
    .join("");

  $("#rows").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const row = btn.parentElement;
    const open = row.dataset.open !== "true";
    row.dataset.open = open;
    btn.setAttribute("aria-expanded", open);
  });

  // rules
  const p = data.points;
  const rules = [
    [p.mergedPr, "Merged PR", "Every pull request merged during October."],
    [`+${p.maxSizeBonus}`, "Size bonus", "Up to 5 per PR on a log scale. Lockfiles and minified files don't count."],
    [`${p.commitWeight}√n`, "Commits", "Square-root dampened: 4 commits = 6 pts, 100 commits = 30 pts."],
    [p.issueResolved, "Issue resolved", "Each issue your merged PR closes with \"Closes #n\"."],
    [p.issueReported, "Issue reported", `Issues you open that get completed. Max ${p.maxIssuesReported}.`],
    [p.review, "Review", `Reviewing someone else's merged PR. Max ${p.maxReviews}.`],
  ];
  $("#rule-grid").innerHTML = rules
    .map(([v, t, d]) => `<div class="rule"><div class="val">${esc(v)}</div><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`)
    .join("");

  $("#formula").textContent =
    `score = ${p.mergedPr} x PRs\n` +
    `      + sum( min(${p.maxSizeBonus}, log2(1 + lines) / 2) )   per PR\n` +
    `      + ${p.commitWeight} x sqrt(commits)\n` +
    `      + ${p.issueResolved} x issues resolved\n` +
    `      + ${p.issueReported} x min(${p.maxIssuesReported}, issues reported)\n` +
    `      + ${p.review} x min(${p.maxReviews}, PRs reviewed)`;
})();
