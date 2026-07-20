import type { CustomerLicenseTransition } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { batchTransitionTask } from "@/internal/billing/v2/actions/batchTransition/tasks/batchTransitionTask";
import { isSameRowTransition } from "@/internal/billing/v2/compute/customerLicenseTransitions/isSameRowTransition";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo";
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

		await batchTransitionTask.trigger(
			{
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: ctx.customerId,
				transition,
				executionScope: {
					batchTransitionId: generateId("batch_transition"),
					assignmentCutoffMs: Date.now(),
				},
			},
			{ concurrencyKey: updates.linkId },
		);
	}
};
