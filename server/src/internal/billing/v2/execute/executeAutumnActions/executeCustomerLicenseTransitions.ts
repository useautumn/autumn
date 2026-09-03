import type { CustomerLicenseTransition } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { batchTransition } from "@/internal/billing/v2/actions/batchTransition/batchTransition";
import { batchTransitionTask } from "@/internal/billing/v2/actions/batchTransition/tasks/batchTransitionTask";
import { SYNC_BATCH_TRANSITION_MAX_ENTITIES } from "@/internal/billing/v2/actions/batchTransition/utils/batchTransitionConstants";
import { isSameRowTransition } from "@/internal/billing/v2/compute/customerLicenseTransitions/isSameRowTransition";
import { countEntitiesByInternalCustomerId } from "@/internal/entities/repos/countEntitiesByInternalCustomerId";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo";
import { shouldRunTriggerTasksInline } from "@/trigger/utils/shouldRunTriggerTasksInline";
import { generateId } from "@/utils/genUtils";

/** Converges license pools and their assigned seat definitions.
 * Persists pre-existing successor pools during scheduled activation. */
export const executeCustomerLicenseTransitions = async ({
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

		if (isSameRowTransition(transition)) {
			await customerLicenseRepo.repointDefinition({
				db: ctx.db,
				customerLicenseId: incomingCustomerLicense.id,
				planLicenseId: planLicense.id,
				included: planLicense.included,
				paidQuantity: updates.paidQuantity,
			});
			ctx.logger.info(
				`[licenseTransitions] repointed pool ${incomingCustomerLicense.id} definition ${transition.outgoingCustomerLicense.plan_license_id} -> ${planLicense.id}`,
				{
					data: {
						customerLicenseId: incomingCustomerLicense.id,
						customerLicenseLinkId: updates.linkId,
						fromPlanLicenseId:
							transition.outgoingCustomerLicense.plan_license_id,
						toPlanLicenseId: planLicense.id,
						updates,
					},
				},
			);
		} else {
			await customerLicenseRepo.carryCustomerLicenseState({
				db: ctx.db,
				customerLicenseId: incomingCustomerLicense.id,
				linkId: updates.linkId,
				granted: updates.granted,
				remaining: updates.remaining,
				paidQuantity: updates.paidQuantity,
			});
		}

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
