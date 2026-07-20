import type { CustomerLicenseTransition } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { listDistinctEntitlementsByCustomerLicense } from "@/internal/products/entitlements/repos/listDistinctEntitlementsByCustomerLicense";
import { computeProductTransitions } from "../compute/transitions/computeProductTransitions";
import { MAX_DISTINCT_ENTITLEMENTS } from "../utils/batchTransitionConstants";
import { enforceDistinctEntitlementLimit } from "./enforceDistinctEntitlementLimit";

export const validateCustomerEntitlementBatchTransitions = async ({
	ctx,
	transitions,
}: {
	ctx: AutumnContext;
	transitions: CustomerLicenseTransition[] | undefined;
}) => {
	await Promise.all(
		(transitions ?? []).map(async (transition) => {
			const fromProduct =
				transition.outgoingCustomerLicense.planLicense?.product;
			const toProduct = transition.incomingCustomerLicense.planLicense?.product;
			if (!fromProduct || !toProduct) return;

			const entitlementPriceTransitions = computeProductTransitions({
				fromProduct,
				toProduct,
			}).entitlementPrices;
			if (
				entitlementPriceTransitions.transitions.length === 0 &&
				entitlementPriceTransitions.added.length === 0 &&
				entitlementPriceTransitions.deleted.length === 0
			) {
				return;
			}

			const definitions = await listDistinctEntitlementsByCustomerLicense({
				db: ctx.db,
				customerLicenseLinkId: transition.updates.linkId,
				limit: MAX_DISTINCT_ENTITLEMENTS + 1,
			});
			enforceDistinctEntitlementLimit({ count: definitions.length });
		}),
	);
};
