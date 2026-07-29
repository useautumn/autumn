import type { AgentDocsConfig, Source } from "./types.js";

/** Identity helper that types the config and enables editor autocomplete. */
export const defineConfig = (config: AgentDocsConfig): AgentDocsConfig =>
	config;

/** Canonical docs source, relative to `apps/docs/mintlify`. */
export const docs = (page: string): Source => ({ type: "docs", page });

/**
 * Transitional source read from `packages/mcp/src/resources-v2` for content not
 * yet migrated into canonical docs pages. Relative to that folder.
 */
export const legacy = (file: string): Source => ({ type: "legacy", file });
