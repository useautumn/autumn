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
const bodySchema = z.record(z.string(), z.unknown());

export const handleUpdateOrgConfig = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: bodySchema,
	handler: async (c) => {
		const { db, org } = c.get("ctx");
		const raw = c.req.valid("json");

		const sentKeys = Object.keys(raw).filter((k) => validKeys.has(k));
		const idempotencySent = "idempotency_config" in raw;

		if (sentKeys.length === 0 && !idempotencySent) {
			return c.json({
				success: true,
				config: OrgConfigSchema.parse(org.config),
			});
		}

		const parsedIdempotency = idempotencySent
			? IdempotencyConfigSchema.nullable().safeParse(raw.idempotency_config)
			: null;
		if (parsedIdempotency && !parsedIdempotency.success) {
			throw new RecaseError({
				message:
					parsedIdempotency.error.issues[0]?.message ??
					"Invalid idempotency config",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const validated = OrgConfigSchema.partial().parse(raw) as Record<
			string,
			unknown
		>;
		const updates = Object.fromEntries(
			sentKeys.map((k) => [k, validated[k]]),
		) as Partial<OrgConfig>;

		if (updates.block_overdue_entitlements !== undefined) {
			updates.include_past_due = !updates.block_overdue_entitlements;
		} else if (updates.include_past_due !== undefined) {
			updates.block_overdue_entitlements = !updates.include_past_due;
		}

		const [row] = await db
			.update(organizations)
			.set({
				...(sentKeys.length > 0
					? {
							config: sql`COALESCE(config, '{}'::jsonb) || ${JSON.stringify(updates)}::jsonb`,
						}
					: {}),
				...(parsedIdempotency?.success
					? { idempotency_config: parsedIdempotency.data }
					: {}),
			})
			.where(eq(organizations.id, org.id))
			.returning({
				config: organizations.config,
				idempotency_config: organizations.idempotency_config,
			});

		await clearOrgCache({ db, orgId: org.id });

		return c.json({
			success: true,
			config: OrgConfigSchema.parse(row?.config ?? {}),
			idempotency_config: row?.idempotency_config ?? null,
		});
	},
});
