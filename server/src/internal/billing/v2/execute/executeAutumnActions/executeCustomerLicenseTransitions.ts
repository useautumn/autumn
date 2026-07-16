import type { CustomerLicenseTransition } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isSameRowTransition } from "@/internal/billing/v2/compute/customerLicenseTransitions/isSameRowTransition";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo";
import { enqueueRepointSeatEntitlements } from "@/trigger/licenses/repointSeatEntitlementsTask";

/**
 * Executes license transitions from the plan.
 * Pool half: same-row transitions converge the surviving row in place;
 * cross-row successors already persisted through their insert.
 * Seat half: prices repoint inline (they must land with the Stripe update);
 * entitlement repoints are heavy on the fat cusEnts table and don't bill,
 * so they converge in the background. Every mapping is logged so a bad
 * transition is reversible by swapping from/to.
 */
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
		}

		for (const priceTransition of transition.priceTransitions) {
			const repointedRows = await licenseAssignmentRepo.repointSeatPrices({
				db: ctx.db,
				customerLicenseLinkId: updates.linkId,
				fromPriceId: priceTransition.fromPriceId,
				toPriceId: priceTransition.toPriceId,
			});
			ctx.logger.info(
				`[licenseTransitions] repointed seat prices link=${updates.linkId} from=${priceTransition.fromPriceId} to=${priceTransition.toPriceId} rows=${repointedRows}`,
				{
					data: {
						customerLicenseLinkId: updates.linkId,
						...priceTransition,
						repointedRows,
					},
				},
			);
		}

		if (transition.entitlementTransitions.length > 0) {
			await enqueueRepointSeatEntitlements({
				ctx,
				customerLicenseLinkId: updates.linkId,
				entitlementTransitions: transition.entitlementTransitions,
				source: "license-transition",
			});
		}
	}
};
