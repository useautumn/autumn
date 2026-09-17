import {
	type CreditRateCard,
	entitlementToCreditSystem,
	getCreditCost,
	getCreditRateCard,
	isUnlimitedCustomerEntitlement,
	RecaseError,
} from "@autumn/shared";
import { UnsupportedCommandError } from "../../errors.js";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../models/subject/workerFullSubject.js";
import type { DeductionRequest } from "../types/deductionRequest.js";

export type CreditCost = {
	creditCost: number;
	rateCard: CreditRateCard | null;
};

/** `computeCreditCosts` for one row: credits per tracked unit under the row's effective schema, and the rate card if usage is attributed. */
export const resolveCreditCost = ({
	customerEntitlement,
	request,
}: {
	customerEntitlement: WorkerFullCustomerEntitlementWithProduct;
	request: DeductionRequest;
}): CreditCost => {
	const { featureId, internalFeatureId } = request;
	const creditSystem = entitlementToCreditSystem({
		entitlement: customerEntitlement.entitlement,
	});
	const eventProperties = request.properties ?? undefined;
	try {
		const rateCard =
			getCreditRateCard({
				sourceFeature: { id: featureId, internal_id: internalFeatureId },
				creditSystem,
				eventProperties,
			}) ?? null;
		if (rateCard && isUnlimitedCustomerEntitlement({ customerEntitlement }))
			throw new UnsupportedCommandError({
				reason: "rate_card_on_unlimited_row",
			});
		if (rateCard && customerEntitlement.additional_balance !== 0)
			throw new UnsupportedCommandError({
				reason: "rate_card_with_additional_balance",
			});
		return {
			creditCost: getCreditCost({ featureId, creditSystem, eventProperties }),
			rateCard,
		};
	} catch (error) {
		if (error instanceof RecaseError)
			throw new UnsupportedCommandError({ reason: "credit_rate_invalid" });
		throw error;
	}
};
