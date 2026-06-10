import {
	AgentRulesSchema,
	agentRules,
	defaultAgentRules,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const getAgentRules = async ({
	db,
	orgId,
}: {
	db: DrizzleCli;
	orgId: string;
}) => {
	const row = await db.query.agentRules.findFirst({
		where: eq(agentRules.org_id, orgId),
	});
	const defaults = defaultAgentRules();

	return {
		...AgentRulesSchema.parse({
			credit_rules: row?.credit_rules ?? defaults.credit_rules,
			entity_rules: row?.entity_rules ?? defaults.entity_rules,
			notes: row?.notes ?? defaults.notes,
		}),
		metadata: row?.metadata ?? {},
		org_id: orgId,
		org_slug: row?.org_slug,
		updated_at: row?.updated_at,
	};
};
