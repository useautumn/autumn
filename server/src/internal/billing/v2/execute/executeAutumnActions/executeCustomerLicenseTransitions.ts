import type { CustomerLicenseTransition } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { batchTransition } from "@/internal/billing/v2/actions/batchTransition/batchTransition";
import { batchTransitionTask } from "@/internal/billing/v2/actions/batchTransition/tasks/batchTransitionTask";
import { SYNC_BATCH_TRANSITION_MAX_ENTITIES } from "@/internal/billing/v2/actions/batchTransition/utils/batchTransitionConstants";
import { countEntitiesByInternalCustomerId } from "@/internal/entities/repos/countEntitiesByInternalCustomerId";
import { shouldRunTriggerTasksInline } from "@/trigger/utils/shouldRunTriggerTasksInline";
import { generateId } from "@/utils/genUtils";
import { persistCustomerLicenseTransitions } from "./persistCustomerLicenseTransitions";

export const dispatchCustomerLicenseTransitions = async ({
	ctx,
	customerLicenseTransitions,
}: {
	ctx: AutumnContext;
	customerLicenseTransitions: CustomerLicenseTransition[] | undefined;
}) => {
	const hasTransitions = (customerLicenseTransitions ?? []).length > 0;
	// Small customers get their transition awaited in-request so upgrades are
	// synchronous; the capped count keeps this probe O(threshold) for whales.
	const customerEntityCount = hasTransitions
		? await countEntitiesByInternalCustomerId({
				db: ctx.db,
				internalCustomerId:
					customerLicenseTransitions![0].incomingCustomerLicense
						.internal_customer_id,
				cap: SYNC_BATCH_TRANSITION_MAX_ENTITIES,
			})
		: 0;
	const runSynchronously =
		customerEntityCount < SYNC_BATCH_TRANSITION_MAX_ENTITIES;

	for (const transition of customerLicenseTransitions ?? []) {
		const { incomingCustomerLicense, updates } = transition;
		const planLicense = incomingCustomerLicense.planLicense;
		if (!planLicense) continue;

		const executionScope = {
			batchTransitionId: generateId("batch_transition"),
			assignmentCutoffMs: Date.now(),
		};

		if (runSynchronously) {
			await batchTransition({ ctx, transition, executionScope });
			continue;
		}

		if (shouldRunTriggerTasksInline()) {
			void batchTransition({ ctx, transition, executionScope }).catch(
				(error) => {
					ctx.logger.error("[licenseTransitions] batch transition failed", {
						data: {
							customerLicenseLinkId: updates.linkId,
							error: error instanceof Error ? error.message : String(error),
						},
					});
				},
			);
			continue;
		}

		await batchTransitionTask.trigger(
			{
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: ctx.customerId,
				transition,
				executionScope,
			},
			{ concurrencyKey: updates.linkId },
		);
	}
};

export const executeCustomerLicenseTransitions = async ({
	ctx,
	customerLicenseTransitions,
}: {
	ctx: AutumnContext;
	customerLicenseTransitions: CustomerLicenseTransition[] | undefined;
}) => {
	await persistCustomerLicenseTransitions({ ctx, customerLicenseTransitions });
	await dispatchCustomerLicenseTransitions({ ctx, customerLicenseTransitions });
};
