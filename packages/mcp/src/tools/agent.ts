import * as z from "zod/v4";
import { createDomainTools } from "./utils/builders.js";
import type { ToolDomain } from "./utils/types.js";

const emptySchema = z.object({}).strict();
const updateAgentRulesSchema = z
	.object({
		credit_rules: z
			.object({
				credit_feature_id: z.string().optional(),
			})
			.optional(),
		entity_rules: z
			.object({
				attach_to_entities: z.boolean().optional(),
				entity_feature_id: z.string().optional(),
			})
			.optional(),
		notes: z.string().optional(),
	})
	.strict();

const endpoints = {
	getAgentRules: "/v1/agent.get_rules",
	updateAgentRules: "/v1/agent.update_rules",
} as const;

const schemas = {
	getAgentRules: emptySchema,
	updateAgentRules: updateAgentRulesSchema,
} as const;

const { operation } = createDomainTools({ endpoints, schemas });

const domain = {
	operations: [
		operation({
			id: "getAgentRules",
			description: `
- Fetch current org agent rules.
- MCP API call; invoke this tool directly, never through Bash.
- Use before customer, billing, balance, entity, or plan work.
- Includes entity defaults, credit defaults, and org notes.
			`.trim(),
		}),
		operation({
			id: "updateAgentRules",
			description: `
- Update current org agent rules.
- Use only when the user asks to change org-specific behavior.
- Supports entity defaults, credit defaults, and org notes.
			`.trim(),
			idempotent: true,
		}),
	],
} satisfies ToolDomain;

export const agent = { endpoints, schemas, domain };
