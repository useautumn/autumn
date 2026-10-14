import type { CustomerLicenseTransition } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { batchTransition } from "@/internal/billing/v2/actions/batchTransition/batchTransition";
import { batchTransitionInBackground } from "@/internal/billing/v2/actions/batchTransition/batchTransitionInBackground";
import { batchTransitionTask } from "@/internal/billing/v2/actions/batchTransition/tasks/batchTransitionTask";
import { SYNC_BATCH_TRANSITION_MAX_ENTITIES } from "@/internal/billing/v2/actions/batchTransition/utils/batchTransitionConstants";
import { isSameRowTransition } from "@/internal/billing/v2/compute/customerLicenseTransitions/isSameRowTransition";
import { countEntitiesByInternalCustomerId } from "@/internal/entities/repos/countEntitiesByInternalCustomerId";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo";
import { shouldRunTriggerTasksInline } from "@/trigger/utils/shouldRunTriggerTasksInline";
import { generateId } from "@/utils/genUtils";

export type PendingBatchTransition = {
	transition: CustomerLicenseTransition;
	executionScope: { batchTransitionId: string; assignmentCutoffMs: number };
	runSynchronously: boolean;
};

export const executeCustomerLicenseTransitions = async ({
	ctx,
	customerLicenseTransitions,
}: {
	ctx: AutumnContext;
	customerLicenseTransitions: CustomerLicenseTransition[] | undefined;
}): Promise<PendingBatchTransition[]> => {
	const pending: PendingBatchTransition[] = [];
	const hasTransitions = (customerLicenseTransitions ?? []).length > 0;
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

		pending.push({
			transition,
			executionScope: {
				batchTransitionId: generateId("batch_transition"),
				assignmentCutoffMs: Date.now(),
			},
			runSynchronously,
		});
	}
	return pending;
};

export const startBatchTransitions = async ({
	ctx,
	pending,
}: {
	ctx: AutumnContext;
	pending: PendingBatchTransition[];
}): Promise<void> => {
	for (const { transition, executionScope, runSynchronously } of pending) {
		if (runSynchronously) {
			await batchTransition({ ctx, transition, executionScope });
			continue;
		}

		if (shouldRunTriggerTasksInline()) {
			void batchTransitionInBackground({
				ctx,
				transition,
				executionScope,
			}).catch((error) => {
				ctx.logger.error("[licenseTransitions] batch transition failed", {
					data: {
						customerLicenseLinkId: transition.updates.linkId,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			});
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
			{ concurrencyKey: transition.updates.linkId },
		);
	}
};
