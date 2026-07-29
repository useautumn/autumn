# Agent Experience Revamp — Plan & Progress

> Status: in progress. Foundation + `concepts` and `modelling-pricing` skills shipped;
> consumer wiring and remaining skills are next.

## 1. Why

Autumn's agent/onboarding experience is **outdated, scattered, and unstructured for
future revision**. The same knowledge is independently re-authored across four
surfaces with **no shared source**:

| Surface | Where | Re-authors |
|---|---|---|
| In-app **pricing agent** | `server/src/internal/misc/pricingAgent/pricingAgentRouter.ts` (inline `SYSTEM_PROMPT` + `build_pricing` tool) | pricing-modeling |
| **MCP resources** | `packages/mcp/src/resources-v2/**` + `mcpInstructions.md` | concepts, modeling, billing ops |
| **atmn skills** | `packages/atmn/src/prompts/skills/*` (4 SKILL.md strings, installed into user repos) | setup, gating, billing-page, modeling |
| **Human docs** | `apps/docs/mintlify/**` | everything, for humans |

Pricing-modeling is **quadruplicated**; setup/payment **triplicated**. Dashboard
onboarding "copy prompt" already pulls from `atmn/skills` (the one good link).
`ai/config/skills/**` (74 SKILL.md) is **internal repo tooling — out of scope**.

**Goal:** one canonical content corpus + a translation layer that emits every
modality (MCP resources, skills, llms.txt, in-app prompts), so revisions happen
**once** and propagate everywhere. Clean enough to potentially open-source the pattern.

## 2. Research (industry)

- Vercel / Cloudflare / Stripe all converge on **one canonical content source →
  many generated outputs** (llms.txt, per-page markdown, MCP, skills).
- **MCP vs Skills are complementary**, not competing: MCP = *capability* (do things,
  live/auth'd); Skills + llms.txt = *judgment/reference* (how to write integration code).
- **MCP context-bloat is solved** (Tool Search ~85%, code execution ~98.7%); MCP
  *resources* are already progressive-disclosure. Keep the *tool* surface lean.
- **Agent Skills** (Anthropic guide): `SKILL.md` (frontmatter `name`+`description`,
  always-loaded) + body (loaded when relevant) + `references/` (on-demand). Keep
  SKILL.md focused (<5k words); move detail to `references/` and link with a clear
  "read when…" pointer. Folder + name kebab-case; description = what + when, no `<>`.

## 3. Decisions (locked)

1. **`apps/docs/mintlify` stays canonical** for reference content. `packages/agent-docs`
   is a pure **translation layer** — it holds no reference content, only translates.
2. **Hybrid docs pages**: human prose stays visible; dense agent material lives in a
   collapsed `<Accordion title="Agent reference">` (hidden from readers). The agent
   ingestion copies the **whole page** (unwraps components). `$` is escaped `\$` for
   Mintlify and unescaped on import.
3. **Agent-specific rules/steps** (modeling patterns, setup steps, MCP instructions)
   live in `agent-docs` (composition mdx / `content/`), not docs.
4. **Examples** → live typed fixtures rendered per surface (DSL camelCase for
   docs/atmn, JSON snake_case for MCP). *Deferred.*
5. **Agents** share content but keep **separate engines** (pricing agent & Slack/Leaf).
6. **Modality**: MCP-first for operate; skills + llms.txt for integrate; one-command
   skill install to kill friction.
7. **Config is typed TS** (`defineConfig`, `docs()`, `legacy()`).
8. **Skill taxonomy**: A. modelling-pricing · B. integration · C. billing-and-management,
   plus **concepts** (data ontology, foundational). Build **A + B first** (largest
   surface: dashboard agent, atmn, user CC+MCP).
9. **Cross-reference convention**: any skill FIRST references its prerequisite —
   modelling-pricing → concepts; integration/billing → modelling-pricing.

## 4. Architecture — `packages/agent-docs`

Humans edit two things; `src/` is machinery.

```
agent-docs.config.ts        # typed: each entry's formats (mcp/skill) + composition
content/                    # agent-only mdx
  skills/<name>.mdx         #   frontmatter + framing + insert tags
src/
  config/                   # types + defineConfig / docs() / legacy()
  translate/
    ingest/                 # mdxToMarkdown, docsPage (adds frontmatter title), frontmatter
    composeSources.ts       # resource body = sources concatenated ("as normal")
    composeSkill.ts         # skill = frontmatter + framing + resolved tags
    formats/                # toMcpResource, toSkill + types
  consume/
    mcp.ts                  # mcpResources + withAgentDocResources(base) override-by-uri
    skills.ts               # skills + writeSkills({ targetDir })
  generated/                # runtime .ts (imported by consumers; no runtime fs)
generated/                  # readable rendered .md / SKILL.md / references (inspect)
scripts/generate.ts         # config → translate → build each format → write
```

Subpath exports: `@autumn/agent-docs/mcp`, `@autumn/agent-docs/skills`. Generated
files excluded from Biome via package `biome.json`. `bun run gen` regenerates all.

### Composition tags (in `content/skills/*.mdx`)
- `<docs url="/documentation/…" />` — inline a translated docs page (with its title).
- `<reference url="…" when="…" />` — split page into `references/<slug>.md`; leave a
  "read when…" pointer (progressive disclosure).
- `<skill name="…" reason="…" />` — point at a prerequisite skill to load first.

### Formats
- **mcp**: resource = its `sources` concatenated as normal. `withAgentDocResources`
  overrides any base MCP resource whose `uri` matches a generated one.
- **skill**: a folder (`SKILL.md` + `references/`); name/description from frontmatter.

## 5. Shipped

- **Package foundation** (config/translate/consume layers, generators, readable output).
- **`concepts`** entry → MCP resource `autumn://docs/concepts` (wired into the live
  MCP server via `withAgentDocResources`) **and** the `autumn-concepts` skill.
  `plan-item` migrated to `apps/docs/.../concepts/plan-items.mdx` (Agent reference
  accordion); other 6 concept parts still `legacy()` from `resources-v2` (kept intact,
  not regressed). plan-items is a `references/` file in the skill.
- **`autumn-modelling-pricing`** skill: prereq → concepts, consolidated modeling rules
  as framing, 9 `references/` from `documentation/modelling-pricing/*`.
- MCP `concepts` output verified byte-stable through the refactors (then title added
  intentionally). `resources-v2` and dead `resources/**` kept for reference (not deleted).

## 6. Roadmap

**Near-term (A + B):**
1. Wire **dashboard pricing agent**: replace inline `SYSTEM_PROMPT` with
   `[thin pricing wrapper] + [modelling-pricing content]` via a `consume/prompt` adapter.
2. Add **mcp format** to `modelling-pricing` (user CC+MCP surface); reconcile the
   existing `plan-management` resource.
3. Point **atmn** `useCreateSkills`/`useCreateGuides` at `@autumn/agent-docs/skills`
   (`writeSkills`); delete hand-authored `packages/atmn/src/prompts/skills/*`.
4. Build **skill B — integration** (setup + gating), referencing modelling-pricing.
5. Repoint dashboard `onboardingPrompts.ts` from `atmn/skills` → agent-docs.

**Later:**
- Skill **C — billing-and-management** (billing page, subscriptions, billing ops).
- Migrate remaining concept parts + `plan-management`/`billing` MCP resources into
  agent-docs; move `mcpInstructions.md` in as shared agent-only instructions; kill
  Leaf's deep import + duplicated doc-URI list.
- **llms.txt** format; example **fixturization**; one-command skill distribution.
- Delete dead code: `packages/mcp/src/resources/**`, atmn `useAgentSetup`/`AgentStep`
  (Lorem-ipsum stub).

## 7. Mental model — two layers

- **Domain content** (what to know) → agent-docs, consumed as MCP resources / skills /
  prompt text. Kills the duplication.
- **Behavioral instructions** (how to act) → shared parts (mcpInstructions, modeling
  rules, approval semantics) single-sourced in agent-docs; each surface keeps a thin
  per-surface wrapper (Slack reply-style, pricing live-preview, MCP tool rules).

There is no single "unified prompt" — there is one unified **source**, two layers,
many thin consumers.
