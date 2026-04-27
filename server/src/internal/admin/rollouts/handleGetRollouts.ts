import { organizations, Scopes } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getRolloutConfigFromSource,
	getRolloutConfigStatus,
} from "@/internal/misc/rollouts/rolloutConfigStore.js";

export const handleGetRollouts = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const { db } = c.get("ctx");
		const status = getRolloutConfigStatus();
		const config = await getRolloutConfigFromSource();
		const orgIds = [
			...new Set(
				Object.values(config.rollouts).flatMap((rollout) =>
					Object.keys(rollout.orgs),
				),
			),
		];
		const orgs =
			orgIds.length > 0
				? await db
						.select({
							id: organizations.id,
							name: organizations.name,
							slug: organizations.slug,
						})
						.from(organizations)
						.where(inArray(organizations.id, orgIds))
				: [];

		return c.json({
			rollouts: config.rollouts,
			orgsById: Object.fromEntries(orgs.map((org) => [org.id, org])),
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
