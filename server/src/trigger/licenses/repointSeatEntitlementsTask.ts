import { AppEnv } from "@autumn/shared";
import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

// Task files must live under src/trigger (trigger.config.ts dirs glob);
// executeCustomerLicenseTransitions owns when this runs.

const PayloadSchema = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	customerLicenseLinkId: z.string(),
	entitlementTransitions: z.array(
		z.object({ fromEntitlementId: z.string(), toEntitlementId: z.string() }),
	),
	source: z.string().optional(),
});

export type RepointSeatEntitlementsPayload = z.infer<typeof PayloadSchema>;

/** Seat-half entitlement repoint for one license transition. Idempotent:
 * a re-run's from-refs match nothing once converged. The full mapping is
 * logged so a bad transition can be reversed by swapping from/to. */
export const runRepointSeatEntitlements = async ({
	ctx,
	customerLicenseLinkId,
	entitlementTransitions,
	source,
}: {
	ctx: AutumnContext;
	customerLicenseLinkId: string;
	entitlementTransitions: RepointSeatEntitlementsPayload["entitlementTransitions"];
	source?: string;
}): Promise<{ repointed_rows: number }> => {
	const repointedRows = await licenseAssignmentRepo.repointSeatEntitlements({
		db: ctx.db,
		customerLicenseLinkId,
		entitlementTransitions,
	});

	ctx.logger.info(
		`[repointSeatEntitlements] link=${customerLicenseLinkId} rows=${repointedRows} source=${source ?? "unknown"}`,
		{
			data: {
				customerLicenseLinkId,
				entitlementTransitions,
				repointedRows,
				source,
			},
		},
	);

	return { repointed_rows: repointedRows };
};

export const repointSeatEntitlementsTask = task({
	id: "repoint-seat-entitlements",
	maxDuration: 600,
	run: async (raw: unknown, { ctx: triggerCtx }) => {
		const {
			orgId,
			env,
			customerLicenseLinkId,
			entitlementTransitions,
			source,
		} = PayloadSchema.parse(raw);

		const { ctx } = await createTriggerContext({ orgId, env, triggerCtx });

		return runRepointSeatEntitlements({
			ctx,
			customerLicenseLinkId,
			entitlementTransitions,
			source,
		});
	},
});

/** Enqueue; failure is loud but non-fatal — the pool's plan_license_id
 * stays the durable intent, seats remain convergeable. Without a trigger
 * secret (local dev/tests) the repoint runs inline instead. */
export const enqueueRepointSeatEntitlements = async ({
	ctx,
	customerLicenseLinkId,
	entitlementTransitions,
	source,
}: {
	ctx: AutumnContext;
	customerLicenseLinkId: string;
	entitlementTransitions: RepointSeatEntitlementsPayload["entitlementTransitions"];
	source: string;
}): Promise<void> => {
	if (!process.env.TRIGGER_SERVER_SECRET_KEY) {
		await runRepointSeatEntitlements({
			ctx,
			customerLicenseLinkId,
			entitlementTransitions,
			source: `${source}-inline`,
		});
		return;
	}

	await repointSeatEntitlementsTask
		.trigger(
			{
				orgId: ctx.org.id,
				env: ctx.env,
				customerLicenseLinkId,
				entitlementTransitions,
				source,
			},
			{ concurrencyKey: customerLicenseLinkId },
		)
		.then(() => {
			ctx.logger.info(
				`[licenseTransitions] enqueued seat entitlement repoints link=${customerLicenseLinkId} mappings=${entitlementTransitions.length}`,
				{ data: { customerLicenseLinkId, entitlementTransitions } },
			);
		})
		.catch((error) => {
			ctx.logger.error(
				`[licenseTransitions] entitlement repoint enqueue FAILED link=${customerLicenseLinkId} error=${error}`,
				{ data: { customerLicenseLinkId, entitlementTransitions } },
			);
		});
};
