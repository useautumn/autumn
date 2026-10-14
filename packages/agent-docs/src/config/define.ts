import type { AgentDocsConfig, Source } from "./types.js";

export const defineConfig = (config: AgentDocsConfig): AgentDocsConfig =>
	config;

export const docs = (page: string): Source => ({ type: "docs", page });
