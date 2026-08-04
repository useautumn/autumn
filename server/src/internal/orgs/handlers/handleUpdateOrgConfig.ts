import {
	ErrCode,
	IdempotencyConfigSchema,
	type OrgConfig,
	OrgConfigSchema,
	organizations,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
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
		// idempotency_config is its own column (org-wide, not an OrgConfig flag).
		const idempotencySent = "idempotency_config" in raw;

		if (sentKeys.length === 0 && !idempotencySent) {
			return c.json({
				success: true,
				config: OrgConfigSchema.parse(org.config),
			});
		}

		// Validate BEFORE any writes so a bad TTL never partially applies a
		// request that also carries config flags.
		const parsedIdempotency = idempotencySent
			? IdempotencyConfigSchema.nullable().safeParse(raw.idempotency_config)
			: null;
		if (parsedIdempotency && !parsedIdempotency.success) {
			throw new RecaseError({
				message: "Idempotency key duration must be between 1 hour and 30 days",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		if (sentKeys.length > 0) {
			// Validate sent values, then read back only the sent keys so the
			// defaults `.partial()` fills for omitted keys are never merged.
			const validated = OrgConfigSchema.partial().parse(raw) as Record<
				string,
				unknown
			>;
			const updates = Object.fromEntries(
				sentKeys.map((k) => [k, validated[k]]),
			) as Partial<OrgConfig>;

			await db.execute(
				sql`UPDATE organizations
					SET config = COALESCE(config, '{}'::jsonb) || ${JSON.stringify(updates)}::jsonb
					WHERE id = ${org.id}`,
			);
		}

		if (parsedIdempotency?.success) {
			await db
				.update(organizations)
				.set({ idempotency_config: parsedIdempotency.data })
				.where(eq(organizations.id, org.id));
		}

		await clearOrgCache({ db, orgId: org.id });

		const [row] = await db
			.select({
				config: organizations.config,
				idempotency_config: organizations.idempotency_config,
			})
			.from(organizations)
			.where(eq(organizations.id, org.id))
			.limit(1);

		return c.json({
			success: true,
			config: OrgConfigSchema.parse(row?.config ?? {}),
			idempotency_config: row?.idempotency_config ?? null,
		});
	},
});
