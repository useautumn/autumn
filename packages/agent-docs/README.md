# @autumn/agent-docs

Translation layer that turns Autumn's **canonical docs content** into agent-facing
surfaces. Content is authored once (canonical home: `apps/docs`); this package
only *translates* it into formats — it holds no reference content of its own.

## Layout

Humans edit two things; everything in `src/` is machinery.

```
agent-docs.config.ts     # WHAT translates + into WHICH formats (typed config)
content/                 # agent-only mdx
  skills/<name>.mdx       #   skill = frontmatter + framing + insertion tags
src/
  config/                # config types + helpers (defineConfig, docs(), legacy())
  translate/             # sources/mdx → artifacts
    ingest/              #   mdxToMarkdown, frontmatter parser
    composeSources.ts    #   resource body = sources concatenated
    composeSkill.ts      #   skill = frontmatter + resolve <docs>/<legacy> tags
    formats/             #   toMcpResource, toSkill + their types
  consume/               # per-caller utilities
    mcp.ts               #   mcpResources + withAgentDocResources(base)
    skills.ts            #   skills + writeSkills({ targetDir })
  generated/             # runtime .ts artifacts (imported by consumers)
generated/               # readable rendered .md / SKILL.md (inspect here)
scripts/generate.ts      # config entry → translate → build each format → write
```

## Formats

- **mcp**: a resource, composed by concatenating its `sources` ("as normal").
- **skill**: a skill folder (`SKILL.md` + `references/`), composed from a
  `content/` mdx — frontmatter (`name`, `description`) + agent framing + insert
  tags:
  - `<docs url="…" />` — inline a translated docs page into the SKILL.md body.
  - `<reference url="…" when="…" />` — split the page into
    `references/<slug>.md` and leave a pointer in the body, following Agent
    Skills progressive disclosure (keep SKILL.md focused; load detail on demand).
  - `<skill name="…" reason="…" />` — point at a prerequisite skill to load
    first (e.g. modelling-pricing references concepts; integration references
    modelling-pricing).

## Commands

```sh
bun run gen   # regenerate src/generated/*.ts AND readable generated/**
bun run ts    # typecheck
```

`@autumn/mcp` consumes `@autumn/agent-docs/mcp`; `writeSkills` (from
`@autumn/agent-docs/skills`) emits installable SKILL.md folders (future atmn use).

## Migration note

Concept parts still read from `packages/mcp/src/resources-v2` via `legacy(...)` /
`<legacy file=…>`; each migrates to a canonical docs page (becoming `docs(...)` /
`<docs url=…>`) one at a time. MCP `concepts` output is held byte-identical to the
pre-refactor resource.
