# High-Efficiency AI-Assisted Development Workspace with Claude Code

## Development harness in AI-assisted software development

A “development harness” is the *system around the model* that makes AI-assisted development reliable and repeatable: the concrete artefacts, constraints, verification loops, and automation that shape what the agent can do, what it should do, and how it proves it did the right thing. In the literature on harness engineering for coding agents, the core idea is that you reduce supervision by (a) increasing the probability the agent is correct on the first attempt, and (b) building fast feedback loops that catch errors before humans spend time reviewing them. citeturn14view0turn14view1

This is easiest to understand by analogy with a *test harness*: a collection of supporting tools/environment (stubs, drivers, controlled setup) that enables repeatable automated testing. citeturn12search3turn0search2 A development harness generalises this beyond tests: it includes the test harness, but also covers context packaging, tool permissions, guardrails, “how-we-work” procedures, and automation that turns vague tickets into structured, verifiable tasks. citeturn14view2turn14view0

In Claude Code specifically, the harness lives in (at least) five interacting layers:

- **Guidance artefacts (feedforward):** “facts and rules” the agent reads at session start or on demand—project instructions (CLAUDE.md), scoped rules (.claude/rules), and reusable procedures (skills). citeturn1view1turn5view0  
- **Verification artefacts (feedback):** commands and checks the agent can run to validate outcomes (tests, linters, typechecks, formatting, build). Claude Code’s own best-practices guide calls “give Claude a way to verify its work” the highest-leverage move. citeturn1view0turn9view1  
- **Deterministic automation:** hooks that run shell commands at lifecycle events (e.g., auto-format after edits; block protected files), which reduces dependence on the model “remembering” to do the right thing. citeturn3view3turn3view4  
- **Safety and access control:** permission modes, allow/ask/deny rules, and sandboxing—limiting what the agent can do and where it can read/write and connect. citeturn13view0turn9view4  
- **Session and context management:** plan mode vs normal mode, conversation compaction/clears, checkpointing/rewind, worktrees for parallel sessions, and structured handoffs. citeturn8view0turn5view1turn6view0turn9view0  

Why this matters: as context grows, output quality typically degrades (“context rot”), and this effect can appear even when retrieval is perfect; controlled experiments have found substantial performance drops purely from longer inputs. citeturn15view0turn1view0 A harness counters this by keeping context clean, scoped, and verifiable.

## Operational workflows with Claude Code across the SDLC

Claude Code is not just chat; it is an “agentic coding environment” that can read files, run commands, and edit across the codebase, which changes the optimal workflow: you architect *a loop* rather than “ask → copy → paste”. citeturn9view0turn1view2 The Claude docs repeatedly converge on a predictable pattern: **Explore → Plan → Implement → Verify → Commit/PR**, with aggressive context management and explicit verification. citeturn9view1turn1view0turn6view1

Below are practical, repeatable workflows for each task class you listed, with the Claude-specific mechanics that make them work.

### Code exploration (understand, map, locate)

**Goal:** build a *repository impact map* and a *mental model* without consuming your editing budget or polluting context with irrelevant outputs.

1) Start in **Plan Mode** (read-only operations) so exploration doesn’t accidentally mutate the repo. Plan Mode is designed for safe analysis, exploration, and planning; you can enter it via `--permission-mode plan` or set it as default. citeturn8view0turn6view1  
2) Ask for (a) high-level architecture, then (b) a glossary, then (c) concrete file entry points to follow. The official common workflows page explicitly recommends starting broad and progressively narrowing, including tracing execution flows end-to-end. citeturn3view0turn7view0  
3) Where possible, use `@` references to focus: referencing a file/directory in your prompt alters what gets loaded and prevents wandering. citeturn8view3turn5view3  
4) If exploration becomes noisy, delegate it to **subagents** and ask for summaries, keeping your main thread cleaner. citeturn9view2turn7view0  

**Practical prompt pattern (Plan Mode):**
- “Scan the repo and produce an impact map for *X*: key modules, entry points, data models, and tests. Include exact file paths and primary symbols.” (This “structured impact map first” pattern is strongly aligned with harness-engineering guidance: constrain the solution space before you implement.) citeturn14view2turn9view1  

### Feature implementation (TypeScript/Python)

The Claude docs’ recommended workflow is explicit: explore and plan first, then implement in normal mode, then commit/PR. citeturn9view1turn1view2

**Workflow:**
1) **Explore** in Plan Mode: ask Claude to identify *exact files to touch*, expected side-effects, and existing patterns to reuse. citeturn8view0turn14view2  
2) **Plan**: request an implementation plan with acceptance criteria, tests, and risk points; Claude Code lets you open/edit the plan directly in your editor before proceeding. citeturn8view0  
3) **Implement** in normal mode: constrain commits to a small surface area (few files per step), then run verification commands after each increment. Verification loops are emphasised as the single highest-leverage behaviour. citeturn1view0turn9view1  
4) **Commit and PR**: Claude Code can work directly with git, and the docs show PR creation workflows plus PR-linked session resumption. citeturn1view2turn6view1turn6view4  

**Key “harness” move for features:** encode the build/test commands and “definition of done” into project instructions (CLAUDE.md or rules) so the agent can self-verify without you repeating it. citeturn1view1turn1view0

### Refactoring (safe and incremental)

The common workflows guide explicitly recommends refactoring in small, testable increments and verifying via tests after changes. citeturn7view0 The best-practices guide adds a safety valve: **rewind/checkpoints**—you can aggressively try approaches knowing you can restore code/conversation. citeturn9view2turn5view1

**Workflow:**
1) Plan Mode: “Propose refactor steps that preserve behaviour; list invariants and tests to run at each step.” citeturn8view0turn7view0  
2) Implement one refactor slice; run tests; repeat. citeturn6view1turn7view0  
3) If two correction loops fail, “reset the session and rewrite the prompt with what we learned”—this is an explicit failure-mitigation recommendation. citeturn9view3  
4) Use checkpointing/rewind freely for risky steps; note it’s not a replacement for version control and doesn’t track bash changes. citeturn5view1turn9view2  

### Debugging (reproduce → diagnose → fix → guard)

The common workflows guidance for bug-fixing stresses: provide the repro command, a stack trace, and steps to reproduce, then apply targeted changes. citeturn7view0turn1view2

**Workflow:**
1) Capture a reproducible failure: exact command + error + environment assumptions (ports, services, env vars). citeturn7view0turn1view1  
2) Ask for *multiple* hypotheses and a fast plan to disambiguate (e.g., “3 likely causes, and one command/log to confirm each”). This keeps you from paying for long exploratory edits. (This is consistent with harness engineering’s “feedforward + fast feedback sensors”.) citeturn14view0turn1view0  
3) Fix in small steps; create a regression test. Claude Code’s docs explicitly position test-writing and re-running tests as a workflow step. citeturn6view1turn7view0  
4) If the session becomes verbose, use targeted compaction (rewind → “Summarize from here”) or `/compact` with focus instructions. citeturn9view0turn5view1  

### Tests (coverage as verification harness)

Claude Code docs treat test generation as a first-class workflow: identify untested code, generate scaffolding, add edge cases, run and fix failures. citeturn6view1turn8view0

For Python, pytest’s fixture/marker mechanisms help create clean, selective test suites (e.g., `pytest -m <marker>`), which is useful when you want the agent to run only relevant tests during loops. citeturn10search2turn10search26

### Code review (human + AI + CI)

Claude Code offers an automated PR Code Review system (research preview) that analyses pull requests and posts inline findings; it can be tuned with repository files like CLAUDE.md and REVIEW.md, and it explicitly uses specialised agents plus a verification step to filter false positives. citeturn3view5

When you don’t use the managed review service, you can still run Claude non-interactively in CI or scripts using `claude -p`, which is the recommended integration approach for CI/pre-commit style automation. citeturn9view2turn1view2

### Documentation (API docs + runbooks)

The common workflows guide includes a documentation workflow: identify undocumented code, generate docs, review/enhance, then verify against standards, which is ideal for turning “docs drift” into a repeatable harness step. citeturn6view4turn3view0

## Workspace organisation for better context, speed, and answer quality

The central organising principle for Claude Code workspace design is: **store stable truth in the repository; store personal or ephemeral truth locally; keep both concise and structured**. Claude Code’s memory system is explicitly multi-layer: CLAUDE.md files (human-written) + auto memory (Claude-written), both loaded at session start, but serving different roles. citeturn1view1turn5view3

### Instruction layering and scoping

Claude Code’s docs define multiple CLAUDE.md scopes, including:
- Project instructions (`./CLAUDE.md` or `./.claude/CLAUDE.md`) for team-shared conventions. citeturn1view1turn3view1  
- User instructions (`~/.claude/CLAUDE.md`) for personal defaults across projects. citeturn1view1  
- Local per-project instructions (`./CLAUDE.local.md`) that should be gitignored. citeturn1view1  
- Org-wide managed policy instructions (system locations) for enterprise enforcement. citeturn1view1turn3view2  

Claude Code loads CLAUDE.md and CLAUDE.local.md by walking up the directory tree from the working directory and concatenating multiple files (rather than overriding). Nested instructions load on-demand when files in subdirectories are accessed. citeturn1view1turn8view3

**Workspace implication:**  
- Use the root CLAUDE.md as a **routing file**: a concise entrypoint that points to rules, docs, and procedures (skills).  
- Use scoped `.claude/rules/` files for detailed guidance that should only load when relevant. Claude Code supports modular rules, and rules can be path-scoped via YAML frontmatter so they load only when working with matching files—reducing noise and saving context. citeturn1view1turn4search6  

### Use imports to avoid “instruction bloat”

Claude Code supports `@path/to/import` syntax in CLAUDE.md, expanding imports at session start, with a maximum recursion depth of five. External imports trigger a one-time approval dialog. citeturn1view1turn5view3

**Workspace implication:** keep CLAUDE.md short and use imported files for details (architecture docs, runbooks, checklists).

### Store “what you keep re-explaining” as memory

Claude’s documentation gives a simple rule: add to CLAUDE.md when you find yourself repeating the same correction or when a code review catches something Claude should have known. citeturn1view1

Auto memory is stored per project under `~/.claude/projects/<project>/memory/`, with `MEMORY.md` acting as a concise index; only the first 200 lines or 25KB of MEMORY.md are loaded at start, and topic files are loaded on-demand. citeturn1view1

**Workspace implication:** treat auto memory as *a log of discovered operational facts* (build steps, test commands, debugging quirks), while CLAUDE.md/rules remain *the curated standards*.

### Keep context clean: manage tokens as a resource

Claude’s best practices explicitly state performance degrades as the context window fills, because it includes conversation, files read, and command output. citeturn1view0turn9view0 The docs recommend:
- `/clear` between unrelated tasks,  
- `/compact` with focus instructions,  
- targeted summarisation via rewind (“Summarize from here”), and  
- `/btw` for side questions that should not enter the main conversation. citeturn9view0turn9view2turn5view3

This aligns with research showing long input length alone can degrade performance substantially even when retrieval is perfect—meaning “just throw more repo into context” is often counterproductive. citeturn15view0turn1view0

### Worktrees for parallel work and context isolation

Claude Code supports running parallel sessions using git worktrees (`claude --worktree <name>`), creating isolated working directories under `.claude/worktrees/`. It also supports `.worktreeinclude` to copy gitignored files like `.env` into new worktrees, and subagents can use worktree isolation too. citeturn6view0turn13view0

**Workspace implication:** treat worktrees as “cheap sandboxes” for AI-driven changes: one worktree per task, one session name per task, merge cleanly.

## Files, folders, and templates that make Claude Code work better

Claude Code formalises several repository- and user-level artefacts under `.claude/` and `~/.claude/`, including settings, rules, skills, and more; the docs describe `.claude/` as the main project directory for shared configuration, while `~/.claude` applies across projects. citeturn3view1turn3view2

Below is a practical file system that optimises for: (a) fast onboarding of the agent, (b) high verification density, (c) low context noise, and (d) repeatability across TypeScript, Python, and automation scripts.

### Recommended repository skeleton

```text
repo/
  CLAUDE.md
  CLAUDE.local.md              # gitignored (personal)
  .claude/
    settings.json              # shared (team)
    settings.local.json        # gitignored (personal overrides)
    rules/
      00-project.md
      10-typescript.md
      20-python.md
      30-automation-scripts.md
      90-security.md
    skills/
      plan-task/
        SKILL.md
        templates/
          task-brief.md
      implement-feature/
        SKILL.md
        templates/
          feature-brief.md
          acceptance-criteria.md
      debug/
        SKILL.md
        templates/
          debug-brief.md
      review-pr/
        SKILL.md
        templates/
          review-checklist.md
    commands/                  # optional legacy; skills preferred
      quick-check.md
  docs/
    architecture.md
    runbooks/
      local-dev.md
      release.md
    adr/
      0001-*.md
  scripts/
    dev.sh
    verify.sh
    format.sh
    ci-local.sh
  package.json                 # if TS/Node
  pyproject.toml               # if Python
  .pre-commit-config.yaml      # optional but strongly recommended
  .github/workflows/ci.yml     # if GitHub Actions
  .gitlab-ci.yml               # if GitLab CI/CD
  README.md
```

This structure is grounded in Claude Code’s documented configuration model: CLAUDE.md + `.claude/rules/`, settings layers, skills folders with SKILL.md, and worktree support. citeturn1view1turn3view1turn5view0turn13view0

### Core file templates

#### CLAUDE.md (project routing + “definition of done”)

```md
# Project instructions (Claude Code)

## What this repo is
- One paragraph: domain and purpose.
- Key invariants: what must never break.

## How to work here
- Default workflow: Explore (Plan Mode) → Plan → Implement → Verify → Commit/PR.
- Always run: `./scripts/verify.sh` before finishing any change.
- If tests are slow, run the fast suite first: `./scripts/ci-local.sh --fast`.

## Commands you should use
- Install: (fill in) e.g. `pnpm install` or `uv sync`
- Dev: (fill in) e.g. `pnpm dev` or `python -m myapp`
- Tests: (fill in) e.g. `pnpm test` or `pytest -q`
- Lint/format: (fill in) e.g. `pnpm lint` / `ruff check` / `ruff format`

## Where the truth lives
- Architecture overview: @docs/architecture.md
- Local dev runbook: @docs/runbooks/local-dev.md
- Release runbook: @docs/runbooks/release.md

## Rules
- Language-specific: see `.claude/rules/`
- Security-sensitive areas: see `.claude/rules/90-security.md`

## Compaction guidance
When compacting or summarising, preserve:
- the exact commands run and their outcomes
- the list of modified files
- any failing tests and stack traces
```

This matches Claude Code guidance that CLAUDE.md should capture what you’d otherwise re-explain, and that you can customise compaction to preserve key context. citeturn1view1turn9view0

#### CLAUDE.local.md (personal, gitignored)

```md
# Personal project notes (not committed)

- Local URLs, tokens, sandbox accounts, test data seeds.
- Machine-specific setup steps.
- Temporary experiments you don’t want the team to inherit.
```

Claude Code explicitly supports `CLAUDE.local.md` as personal, project-specific instructions that should be gitignored. citeturn1view1

#### `.claude/rules/10-typescript.md` (path-scoped example)

```md
---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript rules

- Prefer small, typed functions with explicit return types at module boundaries.
- Avoid `any`; use `unknown` + narrowing when needed.
- New code must include tests if behaviour changes.
- Run: `pnpm lint`, `pnpm test`, and `pnpm typecheck` before finishing.
```

Rules can be modularised under `.claude/rules/` and scoped by glob patterns via YAML frontmatter, loading only when relevant. citeturn1view1turn4search6

#### `.claude/rules/20-python.md` (path-scoped example)

```md
---
paths:
  - "**/*.py"
---

# Python rules

- Prefer small pure functions; isolate I/O at module edges.
- Tests: use pytest; prefer fixtures for setup.
- Formatting/lint: run `ruff format` and `ruff check`.
- Type hints required for public APIs; run `pytest` before finishing.
```

Ruff provides both linting and formatting (`ruff format`), and can be configured via `pyproject.toml`/`ruff.toml`. citeturn10search1turn10search31

#### `.claude/settings.json` (shared; plan-first + safe automation)

```json
{
  "permissions": {
    "defaultMode": "plan",
    "deny": ["Read(./.env)", "Read(./secrets/**)", "Bash(curl *)"],
    "allow": ["Bash(pnpm *)", "Bash(pytest *)", "Bash(ruff *)", "Bash(git *)"]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "./scripts/format.sh" }
        ]
      }
    ]
  }
}
```

Plan Mode can be configured as default via settings, permission allow/deny rules are first-class configuration, and hooks can run after edits; hooks are designed to provide deterministic automation rather than relying on the model’s initiative. citeturn6view1turn13view0turn3view3turn3view4

### Skills (procedures that load on demand)

Skills are “packaged instructions” that the agent can invoke via `/skill-name`, and—crucially—skill bodies load only when used, which saves context. Custom commands in `.claude/commands/` and skills in `.claude/skills/<name>/SKILL.md` both create slash commands, but skills support supporting files and invocation control. citeturn5view0turn5view3turn5view4

A minimal skill template:

```md
---
name: plan-task
description: Turn a vague request into a structured task brief with file paths, acceptance criteria, and verification commands.
---

## Workflow
1) Ask clarifying questions if necessary.
2) Produce a repository impact map (modules, exact file paths, existing patterns).
3) Produce a Task Brief using templates/task-brief.md.
4) Require explicit verification steps and commands.
5) Hand off with “Next session start prompt” text.
```

Skills are explicitly documented as folders containing SKILL.md with YAML frontmatter + instructions. citeturn5view0turn5view4

## Reliability tactics to reduce hallucinations, rework, and context loss

Reliability failures in coding agents cluster around a few predictable modes: guessing instead of looking, context overload, and weak verification. The harness countermeasures below are grounded in Claude Code’s official best practices plus broader harness-engineering guidance.

### Always anchor the agent in verification

Claude Code best practices highlight that Claude performs dramatically better when it can verify its own work (tests, screenshots, expected outputs), and frames this as the single highest-leverage action. citeturn1view0turn9view1  
Translate this into a concrete engineering rule: **no task is “done” without a deterministic verify command** (e.g., `./scripts/verify.sh`) and a recorded output snippet (pass/fail summary).

### Separate research/planning from execution

Claude Code explicitly warns that letting the agent jump straight to coding risks solving the wrong problem; it recommends Plan Mode and a four-phase workflow (Explore → Plan → Implement → Commit). citeturn9view1turn8view0  
In practice, this means you should treat a feature request as two deliverables:
1) a reviewed impact map + plan,  
2) implementation.  
This is the same “two-phase workflow” recommendation found in harness-engineering guidance for more predictable outcomes. citeturn14view2

### Manage context aggressively (treat tokens like RAM)

Claude Code docs are explicit: the context window includes conversation, files, and command output; it fills quickly and performance degrades as it approaches the limit. citeturn1view0turn9view0 The tool provides specific controls:
- `/clear` between unrelated tasks, citeturn9view0turn5view3  
- `/compact <focus>` to summarise while preserving key decisions, citeturn9view0turn5view3  
- rewind → “Summarize from here” for partial compaction, citeturn5view1turn9view0  
- `/btw` for side questions that should not grow the main conversation. citeturn5view3turn9view2  

This discipline is supported by empirical research showing long-context inputs can hurt model performance even with perfect retrieval. citeturn15view0

### Use deterministic hooks for “non-negotiables”

Hooks run automatically at lifecycle events and can format code after edits, block protected files, inject context, and more; the key property is determinism—hooks fire regardless of what the model “decides”. citeturn3view3turn3view4  
Practical harness move: **convert repeated human reminders into hooks** (format after edits, lint before commits, notify you when Claude needs input). citeturn3view3turn9view3

### Safety: permissions, allowlists, and sandboxing

Claude Code supports permission rules (`allow`, `ask`, `deny`) and a default permission mode; deny rules are evaluated before allow rules, and patterns can match specific bash commands and file paths. citeturn13view0turn9view4  
It also supports sandbox configuration to isolate bash commands (filesystem/network restrictions) and multi-layer configuration scopes (project vs local vs user vs managed). citeturn3view2turn13view0

Reliability impact: you reduce “accidental damage” and make the agent’s operational envelope explicit, which makes both humans and the agent more predictable.

### Checkpoints and rewind as a safety valve

Claude Code checkpointing automatically captures code state before each edit, persists across sessions, and allows restore of code, conversation, or both; it also supports targeted summarisation from checkpoints. citeturn5view1turn9view2  
But it explicitly does *not* track bash-modified files and is not a replacement for version control. citeturn5view1turn9view2

### Use worktrees to prevent collisions and to parallelise safely

Claude Code can create isolated git worktrees per session under `.claude/worktrees/`, and can copy gitignored files via `.worktreeinclude`; subagents may also run in isolated worktrees. citeturn6view0turn13view0  
This gives you a reliable scaling pattern: one session per worktree, one goal per session, merge via PR.

### Integrate external truth via MCP (when needed)

The Model Context Protocol (MCP) is an open protocol to connect LLM applications to external tools and data sources; it’s explicitly positioned as a standardised way to “give AI systems access to the data they need”. citeturn3view7turn3view6  
In Claude Code docs, MCP is described as the integration mechanism for tools like ticket systems, docs, and chat—useful when “the repo is not the whole truth”. citeturn1view2turn2search2

## Integrations with git, tests, linting, CI/CD, and local automation

A harness becomes operational when “verification” and “workflow steps” are runnable as commands—locally and in CI.

### Git and PR workflow integration

Claude Code can work directly with git: stage changes, write commit messages, create branches, and open pull requests. citeturn1view2  
The common workflows docs describe PR creation steps, and note that PRs created via `gh pr create` are automatically linked to the session. citeturn6view4turn6view1  
For parallel work, Claude Code recommends git worktrees and provides a first-class `--worktree` flag. citeturn6view0turn11search2

### Local verification: scripts over “tribal commands”

Create a small set of **canonical scripts** in `./scripts/` that become the shared contract between you, other humans, CI, and Claude:

- `./scripts/format.sh` (fast, idempotent)  
- `./scripts/verify.sh` (the “definition of done”: format + lint + typecheck + tests)  
- `./scripts/ci-local.sh --fast|--full`  

Then embed those commands into CLAUDE.md and/or rules so Claude always knows what “done” means. citeturn1view1turn1view0

For TypeScript formatting, Prettier recommends using `prettier --write` and controlling scope via ignore/config files. citeturn11search3turn11search15  
For Python formatting/linting, Ruff provides `ruff format` and an integrated linter/formatter toolchain. citeturn10search1turn10search17

### Hooks vs git hooks vs pre-commit: when to use which

- **Claude Code hooks**: deterministic automation during agent operation (after edits, before tool use, on session start). Excellent for agent-specific invariants (auto-format after Claude edits; block protected files). citeturn3view3turn3view4  
- **pre-commit**: language-agnostic framework to run checks at git hook time via `.pre-commit-config.yaml`. Best for human + agent consistency; it runs regardless of editor or whether Claude is used. citeturn10search0turn10search20  
- **CI workflows**: enforce checks server-side; essential for preventing “it passed locally” drift. GitHub Actions workflows are defined in YAML; GitLab pipelines are defined in `.gitlab-ci.yml`. citeturn11search0turn11search1turn11search5  

A pragmatic harness approach: hooks enforce *fast local invariants*; pre-commit enforces *commit gate checks*; CI enforces *merge gate checks*.

### CI/CD integration patterns

- On entity["company","GitHub","code hosting company"], workflows are defined as YAML in the repository and orchestrate jobs/steps for build/test/deploy. citeturn11search0turn11search12  
- On entity["company","GitLab","devops platform company"], pipelines/jobs/stages are defined in `.gitlab-ci.yml`. citeturn11search1turn11search5  

Claude Code supports non-interactive mode (`claude -p`) for CI, pre-commit hooks, or scripts, including JSON output formats for programmatic parsing. citeturn9view2turn1view2

### Automated code review (optional but powerful)

Claude Code’s Code Review service analyses PRs and posts inline comments tagged by severity; it can be customised with repository instruction files and is designed not to replace your existing review gates. citeturn3view5  
If you don’t want the managed service, you can approximate it by running non-interactive review prompts in CI (e.g., “review changed files for security issues”) using `claude -p`, as recommended for automation. citeturn9view2turn1view2

## Example workflows for small, medium, and large projects

The harness scales by changing *where you put structure* and *how you control context*—not by writing longer prompts.

### Small project (solo, 1–2 modules, fast tests)

**Harness goal:** minimise friction; keep everything in one page.

- One `CLAUDE.md` at root: build/test/format commands + definition of done. citeturn1view1turn9view1  
- One `./scripts/verify.sh` used by you and Claude.  
- Default to Plan Mode for any task over ~30 minutes (set in `.claude/settings.json`). citeturn8view0turn6view1  
- Use `/clear` between unrelated tasks; use `/btw` for quick side questions. citeturn9view0turn5view3  

**When it works best:** feature slices are small; test suite is fast; you mostly need speed and “don’t break it”. citeturn1view0turn6view1

### Medium project (team, 10s of modules, mixed TS + Python)

**Harness goal:** make standards and procedures shareable without bloating context.

- Root CLAUDE.md stays short; move details into `.claude/rules/` segmented by language/domain. citeturn1view1turn4search6  
- Add 3–5 skills: plan-task, implement-feature, debug, review-pr, onboarding. Skills load on demand, so procedures don’t tax context until used. citeturn5view0turn5view4  
- Add hooks: format after edit; notify when Claude needs input; optionally block edits to protected files. citeturn3view3turn3view4  
- Use one worktree per task (`claude --worktree feature-x`) to isolate changes, especially when multiple tasks run in parallel. citeturn6view0turn11search2  
- Add pre-commit so humans and Claude share the same “commit gate” checks. citeturn10search0turn10search20  

**Where teams win:** predictable PR quality and fewer review cycles when acceptance criteria and verify commands are embedded in task briefs and rules. citeturn14view2turn3view5

### Large project (monorepo, long build, many teams)

**Harness goal:** suppress irrelevant context; enforce correctness via automation; scale out work safely.

- Use path-scoped rules heavily so only relevant guidance loads. citeturn1view1turn4search6  
- Configure `claudeMdExcludes` locally to avoid loading ancestor instructions that don’t apply to your area. citeturn1view1  
- Use worktree performance settings: symlink large directories (e.g., `node_modules`) or use sparse checkouts for specific paths to reduce disk and startup time. citeturn13view0turn6view0  
- Use “fast verify” vs “full verify” scripts and make Claude run fast verify per iteration; full verify before PR. This aligns with “keep feedback loops tight”. citeturn14view0turn1view0  
- Use subagents + worktrees for parallel research/implementation, keeping the main thread clean. citeturn9view2turn6view0  
- Consider the `/batch` bundled skill for large-scale changes: it decomposes work, spawns isolated worktrees, runs tests, and opens PRs (requires a git repo). citeturn5view2turn6view0  

In large repos, this approach is largely “context engineering”: keep the agent’s view narrow, structured, and verifiable to counter long-context degradation. citeturn1view0turn15view0

## Blueprint Recomendado

This blueprint is a complete “personal operating system” for AI-assisted development with Claude Code: repo structure + instructions + scripts + automation + session discipline. It is designed to be reused across TypeScript, Python, and automation-script projects by copying a small harness folder and tailoring two or three files.

### Principles

- **Repository as the system of record:** keep conventions, commands, and runbooks in the repo so the agent can read them (no repeated paste). citeturn14view2turn1view1  
- **Procedures are skills, not CLAUDE.md:** facts and standards go into CLAUDE.md/rules; multi-step procedures go into skills to avoid permanent context cost. citeturn5view0turn5view4  
- **Verification is mandatory and scriptable:** every task ends with a verify command and recorded output. citeturn1view0turn6view1  
- **Determinism for invariants:** convert “always remember to…” into hooks and pre-commit. citeturn3view3turn10search0  
- **Context hygiene:** one goal per session; clear/compact between goals; delegate exploration to subagents; use rewind/checkpoints as safety. citeturn9view0turn9view3turn5view1  

### Recommended operational standard (the default loop)

Use this for almost everything:

1) **Explore (Plan Mode):** build impact map (files + symbols), constraints, risks. citeturn8view0turn14view2  
2) **Plan:** create a stepwise plan + acceptance criteria + verify commands; edit the plan in your editor if needed (`Ctrl+G` plan editing is documented). citeturn8view0turn9view1  
3) **Implement:** small increments; run fast verify each increment. citeturn6view1turn7view0  
4) **Verify:** run full verify; capture output. citeturn1view0turn6view1  
5) **Commit/PR:** have Claude create a clean PR description and highlight risks. citeturn6view4turn1view2  
6) **Review:** run automated review (Code Review service or CI-based non-interactive review); address findings; re-verify. citeturn3view5turn9view2  
7) **Handoff:** update CLAUDE.md/rules if a mistake repeats; let auto memory capture operational learnings; rename/resume sessions by task. citeturn1view1turn7view3turn9view2  

## Plano de Implementação em 7 dias

### Day 1: Baseline your current workflow into one “verify” command
Create `./scripts/verify.sh` that runs whatever your repo currently needs (tests, lint, typecheck). Make it fast and deterministic. Then add the exact command to CLAUDE.md as the definition of done. citeturn1view1turn1view0

### Day 2: Add plan-first safety and core permissions
Create `.claude/settings.json` with `defaultMode: "plan"` and basic allow/deny rules (deny secrets reads; allow safe build commands). Validate permission rule syntax and scope rules in docs. citeturn6view1turn13view0

### Day 3: Modularise instructions with rules (stop bloating CLAUDE.md)
Split language- and domain-specific guidance into `.claude/rules/` and apply `paths:` scoping. Keep root CLAUDE.md as the router + key invariants + verify commands. citeturn1view1turn4search6turn14view2

### Day 4: Add deterministic automation with hooks
Add at least one hook: `PostToolUse` on `Edit|Write` to run format. Add Notification hooks if you want asynchronous workflows. Hooks are designed for deterministic control. citeturn3view3turn3view4

### Day 5: Build 2–3 skills for your highest-frequency workflows
Start with:
- `plan-task` (turn request into structured brief),
- `implement-feature` (enforce Explore→Plan→Implement→Verify),
- `review-pr` (local review checklist + risk surfacing).

Skills are folders with SKILL.md (frontmatter + instructions) and load only on demand. citeturn5view0turn5view4

### Day 6: Standardise git workflow and session hygiene
Adopt “one task = one worktree = one session name” for parallelism and clean context. Add `.worktreeinclude` for gitignored files you need in worktrees. Use `/rename`, `/resume`, and checkpointing/rewind as needed. citeturn6view0turn5view1turn7view3

### Day 7: Wire into CI and add an AI review step
Add CI checks (GitHub Actions or GitLab pipeline) to run the same `verify.sh`. Optionally add a non-interactive Claude review job (`claude -p ...`) for changed files, or enable the Code Review feature if it fits your environment. citeturn11search0turn11search1turn9view2turn3view5

### Copy/paste pack: the five outputs you asked for

#### Model directory structure
```text
repo/
  CLAUDE.md
  CLAUDE.local.md                # gitignored
  .claude/
    settings.json
    settings.local.json          # gitignored
    rules/
      00-project.md
      10-typescript.md
      20-python.md
      30-automation-scripts.md
      90-security.md
    skills/
      plan-task/SKILL.md
      implement-feature/SKILL.md
      debug/SKILL.md
      review-pr/SKILL.md
      onboarding/SKILL.md
  docs/
    architecture.md
    runbooks/local-dev.md
    runbooks/release.md
    adr/
  scripts/
    format.sh
    verify.sh
    ci-local.sh
  .pre-commit-config.yaml
  .github/workflows/ci.yml        # or .gitlab-ci.yml
  README.md
```

This pack matches Claude Code’s documented configuration and instruction model (CLAUDE.md layers, `.claude` directory, rules, skills, settings, worktrees). citeturn3view1turn1view1turn5view0turn6view0

#### Recommended base files
- `CLAUDE.md` (router + invariants + verify commands + compaction guidance). citeturn1view1turn9view0  
- `CLAUDE.local.md` (gitignored personal notes). citeturn1view1  
- `.claude/settings.json` (Plan Mode default + permissions + hooks). citeturn6view1turn13view0turn3view3  
- `.claude/rules/*.md` (scoped standards by language/domain). citeturn1view1turn4search6  
- `.claude/skills/*/SKILL.md` (+ templates) for repeatable procedures. citeturn5view0turn5view4  
- `scripts/verify.sh` and `scripts/format.sh` (canonical verification). citeturn1view0turn3view3  
- `.pre-commit-config.yaml` (commit gate). citeturn10search0  
- CI file: `.github/workflows/ci.yml` or `.gitlab-ci.yml`. citeturn11search0turn11search5  

#### Standard operational workflow
1) Start in Plan Mode → build impact map with exact paths. citeturn8view0turn14view2  
2) Produce a plan with acceptance criteria + verify commands; edit plan (`Ctrl+G`) if needed. citeturn8view0turn9view1  
3) Implement in small increments; run fast verify repeatedly. citeturn7view0turn6view1  
4) Full verify; capture outputs. citeturn1view0turn6view1  
5) Commit/PR; run review step. citeturn6view4turn3view5  
6) Context hygiene: `/clear` between tasks, `/compact` when needed, `/rewind` to recover/summarise, `/btw` for side questions. citeturn9view0turn5view3turn5view1  

#### Best-practices checklist
- Verification command exists and is runnable (`verify.sh`). citeturn1view0  
- Use Explore→Plan→Implement→Commit for multi-file changes. citeturn9view1  
- Keep CLAUDE.md short; modularise into rules; use imports for docs. citeturn1view1turn4search6  
- One task per session; `/clear` between unrelated tasks. citeturn9view3turn9view0  
- Use hooks for invariants (format after edits, protected file blocks). citeturn3view3turn3view4  
- Use checkpointing/rewind aggressively but keep git as system of record. citeturn5view1turn9view2  
- Worktrees for isolation and parallel sessions; `.worktreeinclude` for env files. citeturn6view0turn13view0  
- Permissions: deny secrets reads; allow only safe commands; consider sandbox. citeturn13view0turn9view4  
- Promote repeated corrections into CLAUDE.md/rules; let auto memory capture operational learnings. citeturn1view1  
- CI runs the same verification as local. citeturn11search0turn11search5  

#### Reusable prompt set for daily Claude Code work
Use these as either ad-hoc prompts or as bodies of skills.

1) **Task planning (impact map + brief)**  
“Plan Mode: produce a repository impact map for <goal>. List exact files, key symbols, existing patterns to reuse, risks, and verification commands. Then output a structured task brief with acceptance criteria and test requirements.” citeturn8view0turn14view2  

2) **Feature execution (incremental + verify loop)**  
“Implement the approved plan in small increments. After each increment, run `<fast verify command>` and fix failures. At the end, run `<full verify command>`, then summarise changed files and behavioural changes.” citeturn9view1turn6view1  

3) **Debugging loop**  
“Given this failing command + output, propose 3 hypotheses and 1 confirming check each. Run the minimum checks to disambiguate, then implement the smallest fix and add a regression test.” citeturn7view0turn6view1  

4) **Safe refactor**  
“Plan a behaviour-preserving refactor: list invariants, tests to run per step, and how to validate equivalence. Implement in slices; run tests after each slice.” citeturn7view0turn5view1  

5) **PR review (self-critique + risks)**  
“Review the diff in-context: look for logic errors, security issues, edge cases, and maintainability problems. Rank findings by severity and propose minimal fixes. Then run verify.” citeturn3view5turn1view0  

6) **Documentation pass**  
“Identify undocumented public APIs. Add docs following existing conventions; include examples. Verify docs meet project standards.” citeturn6view4turn3view0  

7) **Context control**  
“This is a side question—answer briefly using /btw semantics (do not add to main thread): <question>.” citeturn5view3turn9view2  

