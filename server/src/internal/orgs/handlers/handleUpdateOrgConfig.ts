import { OrgConfigSchema, type OrgConfig, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { clearOrgCache } from "../orgUtils/clearOrgCache.js";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

const validKeys = new Set(Object.keys(OrgConfigSchema.shape));
const bodySchema = z.record(z.string(), z.boolean());

export const handleUpdateOrgConfig = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: bodySchema,
	handler: async (c) => {
		const { db, org } = c.get("ctx");
		const raw = c.req.valid("json");

		const updates = Object.fromEntries(
			Object.entries(raw).filter(([k]) => validKeys.has(k)),
		) as Partial<OrgConfig>;

		if (Object.keys(updates).length === 0) {
			return c.json({ success: true, config: OrgConfigSchema.parse(org.config) });
		}

		const rows = await db.execute<{ config: OrgConfig }>(
			sql`UPDATE organizations
				SET config = COALESCE(config, '{}'::jsonb) || ${JSON.stringify(updates)}::jsonb
				WHERE id = ${org.id}
				RETURNING config`,
		);

		await clearOrgCache({ db, orgId: org.id });

		const config = (rows as unknown as { config: OrgConfig }[])[0]?.config;
		return c.json({ success: true, config: OrgConfigSchema.parse(config ?? {}) });
	},
});
