import { withLock } from "@/external/redis/redisUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey.js";
import { getLicenseAssignmentResponse } from "../../../licenseResponseUtils.js";
import { afterLicenseMutation } from "../../reconcile/afterLicenseMutation.js";
import { computeLicenseUpdatePlan } from "./computeLicenseUpdatePlan.js";
import { executeLicenseUpdate } from "./executeLicenseUpdate.js";
import { setupLicenseUpdateContext } from "./setupLicenseUpdateContext.js";
import type { LicenseCancelAction } from "./types.js";

export const updateLicense = async ({
	ctx,
	assignmentId,
	cancelAction,
}: {
	ctx: AutumnContext;
	assignmentId: string;
	cancelAction: LicenseCancelAction;
}) => {
	// 1. Setup
	const context = await setupLicenseUpdateContext({ ctx, assignmentId });

	return await withLock({
		lockKey: buildBillingLockKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: context.detachCustomerId,
		}),
		ttlMs: 120000,
		errorMessage:
			"License assignment already in progress for this customer, try again in a few seconds",
		fn: async () => {
			// 2. Compute: already-ended assignments only converge, never re-execute
			const plan = computeLicenseUpdatePlan({
				assignment: context.assignment,
				cancelAction,
			});

			// 3. Execute
			if (plan.endedAt) {
				await executeLicenseUpdate({ ctx, context, plan });
			}

			const response = await getLicenseAssignmentResponse({
				ctx,
				assignment: context.assignment,
			});

			// 4. Converge
			await afterLicenseMutation({
				ctx,
				customerId: context.customer?.id ?? undefined,
				internalCustomerId: context.assignment.internal_customer_id,
				entityId: response.entity_id,
			});

			return plan.endedAt ? { ...response, ended_at: plan.endedAt } : response;
		},
	});
};
