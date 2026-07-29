import {
	Scopes,
	TransitionRuleCarryOverUsagesSchema,
	type TransitionRuleRow,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { TransitionRulesService } from "../transitionRules/TransitionRulesService.js";

const toResponse = (row?: TransitionRuleRow) => ({
	carry_over_usages: row?.carry_over_usages ?? null,
});

export const handleGetTransitionRules = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const row = await TransitionRulesService.get({ db, orgId: org.id, env });
		return c.json(toResponse(row));
	},
});

export const handleUpdateTransitionRules = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: z.object({
		carry_over_usages: TransitionRuleCarryOverUsagesSchema.nullable(),
	}),
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const { carry_over_usages } = c.req.valid("json");
		const row = await TransitionRulesService.upsert({
			db,
			orgId: org.id,
			env,
			carryOverUsages: carry_over_usages,
		});
		return c.json(toResponse(row));
	},
});
