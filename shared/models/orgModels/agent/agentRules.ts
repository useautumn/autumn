import { z } from "zod/v4";

export const DEFAULT_ENTITY_RULES = {
	attach_to_entities: false,
	entity_feature_id: "",
} satisfies {
	attach_to_entities: boolean;
	entity_feature_id: string;
};

export const DEFAULT_CREDIT_RULES = {
	credit_feature_id: "",
} satisfies {
	credit_feature_id: string;
};

export const EntityRulesSchema = z
	.object({
		attach_to_entities: z.boolean().default(false),
		entity_feature_id: z.string().default(""),
	})
	.default(DEFAULT_ENTITY_RULES);

export const CreditRulesSchema = z
	.object({
		credit_feature_id: z.string().default(""),
	})
	.default(DEFAULT_CREDIT_RULES);

export const AgentRulesSchema = z.object({
	entity_rules: EntityRulesSchema,
	credit_rules: CreditRulesSchema,
	notes: z.string().default(""),
});

export const PartialAgentRulesSchema = z.object({
	entity_rules: z
		.object({
			attach_to_entities: z.boolean().optional(),
			entity_feature_id: z.string().optional(),
		})
		.optional(),
	credit_rules: z
		.object({
			credit_feature_id: z.string().optional(),
		})
		.optional(),
	notes: z.string().optional(),
});

export type EntityRules = z.infer<typeof EntityRulesSchema>;
export type CreditRules = z.infer<typeof CreditRulesSchema>;
export type AgentRules = z.infer<typeof AgentRulesSchema>;
export type PartialAgentRules = z.infer<typeof PartialAgentRulesSchema>;

export const defaultAgentRules = (): AgentRules =>
	AgentRulesSchema.parse({
		credit_rules: DEFAULT_CREDIT_RULES,
		entity_rules: DEFAULT_ENTITY_RULES,
		notes: "",
	});

export const mergeAgentRules = ({
	base,
	updates,
}: {
	base?: AgentRules | null;
	updates: PartialAgentRules;
}) =>
	AgentRulesSchema.parse({
		...defaultAgentRules(),
		...(base ?? {}),
		...updates,
		credit_rules: {
			...DEFAULT_CREDIT_RULES,
			...(base?.credit_rules ?? {}),
			...(updates.credit_rules ?? {}),
		},
		entity_rules: {
			...DEFAULT_ENTITY_RULES,
			...(base?.entity_rules ?? {}),
			...(updates.entity_rules ?? {}),
		},
	});
