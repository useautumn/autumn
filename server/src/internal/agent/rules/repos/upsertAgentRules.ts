import { type AgentRules, AgentRulesSchema, agentRules } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const upsertAgentRules = async ({
	db,
	metadata,
	orgId,
	orgSlug,
	rules,
}: {
	db: DrizzleCli;
	metadata?: Record<string, unknown>;
	orgId: string;
	orgSlug: string;
	rules: AgentRules;
}) => {
	const now = Date.now();
	const parsedRules = AgentRulesSchema.parse(rules);
	const rows = await db
		.insert(agentRules)
		.values({
			credit_rules: parsedRules.credit_rules,
			entity_rules: parsedRules.entity_rules,
			metadata: metadata ?? {},
			notes: parsedRules.notes,
			org_id: orgId,
			org_slug: orgSlug,
			created_at: now,
			updated_at: now,
		})
		.onConflictDoUpdate({
			set: {
				credit_rules: parsedRules.credit_rules,
				entity_rules: parsedRules.entity_rules,
				...(metadata ? { metadata } : {}),
				notes: parsedRules.notes,
				org_slug: orgSlug,
				updated_at: now,
			},
			target: agentRules.org_id,
		})
		.returning();

	const row = rows[0];
	if (!row) throw new Error("Failed to upsert agent rules");

	return {
		...AgentRulesSchema.parse({
			credit_rules: row.credit_rules,
			entity_rules: row.entity_rules,
			notes: row.notes,
		}),
		metadata: row.metadata ?? {},
		org_id: row.org_id,
		org_slug: row.org_slug,
		updated_at: row.updated_at,
	};
};
