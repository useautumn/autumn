import type { CustomerLicenseTransition } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { ProductTransitions } from "../compute/transitions/computeProductTransitions";

export const logBatchTransitionProductTransitions = ({
	ctx,
	transition,
	productTransitions,
}: {
	ctx: AutumnContext;
	transition: CustomerLicenseTransition;
	productTransitions: ProductTransitions;
}) => {
	const entitlementPrices = productTransitions.entitlementPrices;

	addToExtraLogs({
		ctx,
		extras: {
			batchTransitionProductTransitions: {
				customerLicenseLinkId: transition.updates.linkId,
				customerProductTransition: productTransitions.customerProduct ?? null,
				fromProductId:
					transition.outgoingCustomerLicense.planLicense?.product.id,
				toProductId: transition.incomingCustomerLicense.planLicense?.product.id,
				basePrice: productTransitions.basePrice
					? {
							type: productTransitions.basePrice.type,
							fromPriceId: productTransitions.basePrice.fromPrice?.id ?? null,
							toPriceId: productTransitions.basePrice.toPrice?.id ?? null,
						}
					: null,
				entitlementPriceTransitions: entitlementPrices.transitions.map(
					({ fromEntitlementPrice, toEntitlementPrice }) => ({
						fromEntitlementId: fromEntitlementPrice.entitlement.id,
						toEntitlementId: toEntitlementPrice.entitlement.id,
						fromPriceId: fromEntitlementPrice.price?.id ?? null,
						toPriceId: toEntitlementPrice.price?.id ?? null,
					}),
				),
				addedEntitlementPrices: entitlementPrices.added.map(
					({ entitlement, price }) => ({
						entitlementId: entitlement.id,
						priceId: price?.id ?? null,
					}),
				),
				deletedEntitlementPrices: entitlementPrices.deleted.map(
					({ entitlement, price }) => ({
						entitlementId: entitlement.id,
						priceId: price?.id ?? null,
					}),
				),
			},
		},
	});
};
