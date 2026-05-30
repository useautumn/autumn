import { type OrgConfig, OrgConfigSchema, Scopes } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { clearOrgCache } from "../orgUtils/clearOrgCache.js";

const validKeys = new Set(Object.keys(OrgConfigSchema.shape));
// Not `OrgConfigSchema.partial()`: its `.default()`s expand a single-field
// request into the full object, clobbering other flags on merge.
const bodySchema = z.record(z.string(), z.unknown());

export const handleUpdateOrgConfig = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: bodySchema,
	handler: async (c) => {
		const { db, org } = c.get("ctx");
		const raw = c.req.valid("json");

		// Known config keys present in the request body.
		const sentKeys = Object.keys(raw).filter((k) => validKeys.has(k));

		if (sentKeys.length === 0) {
			return c.json({
				success: true,
				config: OrgConfigSchema.parse(org.config),
			});
		}

		// Validate sent values, then read back only the sent keys so the
		// defaults `.partial()` fills for omitted keys are never merged.
		const validated = OrgConfigSchema.partial().parse(raw) as Record<
			string,
			unknown
		>;
		const updates = Object.fromEntries(
			sentKeys.map((k) => [k, validated[k]]),
		) as Partial<OrgConfig>;

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
