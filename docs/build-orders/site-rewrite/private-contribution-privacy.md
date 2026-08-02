# Private contribution data — privacy contract

Binding on KW-010 (contribution calendar), KW-014 (encoder), KW-028 (scheduled workflow),
and anything that renders the private cluster.

**Goal:** surface *when* Kevin pushes to private repos and *how many* contributions.
**Non-goal, and a hard prohibition:** any other metadata about those repos.

## The guarantee is the token scope, not the filter

The pipeline must be safe even if its filtering logic is wrong. That is achieved by giving
the workflow a credential that is *incapable* of reading private content.

`CONTRIB_TOKEN` is a classic PAT with **`read:user` and nothing else**, SSO-authorized for
`ethereum-optimism`.

What that token cannot do, by GitHub's own scope enforcement:

| Capability | Requires | `read:user` has it? |
|---|---|---|
| Clone a private repo | `repo` | no |
| Read file contents | `repo` | no |
| List private repo names (`GET /user/repos`) | `repo` | no |
| Read commit messages / SHAs / diffs | `repo` | no |
| Read issues or PRs in a private repo | `repo` | no |
| Read own contribution counts | `read:user` | **yes** |

So a compromised workflow, a leaked log, or a misbehaving agent has nothing to exfiltrate —
there is no code path from this token to private content.

## Measured: what GitHub returns

Verified against the live account on 2026-08-01 with an existing token:

```
restrictedContributionsCount            -> 488            (bare integer, July 2026)
contributionCalendar.contributionDays   -> 2026-07-30, 70 (date + count only)
commitContributionsByRepository         -> {private: 0, public: 8}
```

The third line is the important one: **GitHub itself refuses to name private repositories**
in `commitContributionsByRepository`. Private work is aggregated into
`restrictedContributionsCount` with no identifiers attached. Day-level counts in
`contributionCalendar` include private contributions but carry only `date` and
`contributionCount`.

## Allowed queries

Exactly two fields may inform the private aggregate:

1. `contributionsCollection.contributionCalendar.weeks[].contributionDays[]`
   → `{ date, contributionCount }`
2. `contributionsCollection.restrictedContributionsCount`
   → integer per query window

## Prohibited

- `commitContributionsByRepository`, `pullRequestContributionsByRepository`,
  `issueContributionsByRepository`, `repositoriesContributedTo` — **never** with a token
  that can see private repos. If used at all, only for public enumeration, and every
  result must be asserted `isPrivate == false`.
- Any clone, fetch, tree read, or blob read of a repo not verified public.
- Any org name, repo name, branch name, file path, commit message, or SHA associated with
  a private contribution.
- Sub-day timestamps. Day granularity is the floor; do not record hours.
- Storing `CONTRIB_TOKEN` in `.env`, in the repo, in a workspace, or passing it to an
  agent. It lives only as a GitHub Actions secret, consumed only by the data workflow.

## Payload shape

The private aggregate ships as counts only:

```json
{
  "private": {
    "byDay":  { "2026-07-30": 12 },
    "total":  488,
    "window": { "from": "2026-01-01", "to": "2026-07-31" }
  }
}
```

No `name`, `repo`, `org`, `path`, `sha`, or `message` key may appear anywhere under
`private`. The rendered cluster is labelled "Private repos" and carries no identifiers.

## CI assertion

The bundle validator must fail the build if the emitted payload contains any private
identifier. Suggested check, to live alongside the existing schema validation:

```js
// every key under `private` must be a date or a count
const allowed = new Set(['byDay', 'total', 'window', 'from', 'to'])
const walk = (o, path = 'private') => {
  for (const [k, v] of Object.entries(o ?? {})) {
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(k)
    if (!isDate && !allowed.has(k))
      throw new Error(`private payload leaked key ${path}.${k}`)
    if (v && typeof v === 'object') walk(v, `${path}.${k}`)
    if (typeof v === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(v))
      throw new Error(`private payload leaked string at ${path}.${k}: ${v}`)
  }
}
```

A string that is not a date under `private` is a leak by definition — counts are numbers.

## Operator verification

Run this **after** minting the token and **before** wiring it, to prove the scope holds.
It should print `count OK` and then three `BLOCKED` lines. Any `LEAK` line means the token
has more scope than intended — revoke and re-mint.

```bash
T=<paste token>

# 1. counting works
curl -s -H "Authorization: bearer $T" https://api.github.com/graphql \
  -d '{"query":"{viewer{contributionsCollection{restrictedContributionsCount}}}"}' \
  | grep -q restrictedContributionsCount && echo "count OK" || echo "count FAILED"

# 2. cannot list private repos
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: token $T" \
  'https://api.github.com/user/repos?visibility=private&per_page=1' \
  | grep -qE '^(401|403|404)$' && echo "BLOCKED: repo list" || echo "LEAK: repo list"

# 3. cannot read a private repo
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: token $T" \
  https://api.github.com/repos/ethereum-optimism/optimism/contents/README.md \
  | grep -qE '^(401|403|404)$' && echo "BLOCKED: content" || echo "LEAK: content"

# 4. scopes are exactly read:user
curl -sI -H "Authorization: token $T" https://api.github.com/user \
  | grep -i '^x-oauth-scopes:'
```

Line 4 must read exactly `x-oauth-scopes: read:user`. Anything more is over-scoped.
