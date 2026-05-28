import { type OrgConfig, OrgConfigSchema, Scopes } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { clearOrgCache } from "../orgUtils/clearOrgCache.js";

const validKeys = new Set(Object.keys(OrgConfigSchema.shape));
const bodySchema = OrgConfigSchema.partial();

export const handleUpdateOrgConfig = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: bodySchema,
	handler: async (c) => {
		const { db, org } = c.get("ctx");
		const raw = c.req.valid("json");

		const updates = Object.fromEntries(
			Object.entries(raw).filter(
				([k, v]) => validKeys.has(k) && v !== undefined,
			),
		) as Partial<OrgConfig>;

		if (Object.keys(updates).length === 0) {
			return c.json({
				success: true,
				config: OrgConfigSchema.parse(org.config),
			});
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
