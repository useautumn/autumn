import type {
	EntitlementWithFeature,
	InitCustomerEntitlementContext,
	InitFullCustomerProductOptions,
	Price,
} from "@autumn/shared";
import type {
	BatchTransitionOperations,
	CustomerEntitlementBatchTransition,
	EntitlementIdTransition,
} from "../../types/types";
import type { ProductTransitions } from "../transitions/computeProductTransitions";
import { computeBasePriceOperation } from "./basePriceOperations/computeBasePriceOperation";
import { computeCustomerEntitlementCycleOperations } from "./customerEntitlementCycleOperations/computeCustomerEntitlementCycleOperations";
import { computeEntitlementPriceOperations } from "./entitlementPriceOperations/computeEntitlementPriceOperations";

export const computeBatchTransitionOperations = ({
	candidateOutgoingEntitlements,
	candidateOutgoingBasePrices,
	productTransitions,
	customerEntitlementInitContext,
	customerEntitlementInitOptions,
}: {
	candidateOutgoingEntitlements: EntitlementWithFeature[];
	candidateOutgoingBasePrices: Price[];
	productTransitions: ProductTransitions;
	customerEntitlementInitContext: InitCustomerEntitlementContext;
	customerEntitlementInitOptions: InitFullCustomerProductOptions;
}): Pick<
	CustomerEntitlementBatchTransition,
	"operations" | "unhandledTransitions"
> => {
	const { operations: entitlementPriceOperations, unhandled } =
		computeEntitlementPriceOperations({
			candidateOutgoingEntitlements,
			entitlementPriceTransitions: productTransitions.entitlementPrices,
			customerEntitlementInitContext,
			customerEntitlementInitOptions,
		});
	const basePriceOperation = computeBasePriceOperation({
		basePriceTransition: productTransitions.basePrice,
		candidateOutgoingBasePrices,
	});
	const customerEntitlementCycles = computeCustomerEntitlementCycleOperations({
		basePriceOperation,
		candidateOutgoingEntitlements,
		initContext: customerEntitlementInitContext,
		initOptions: customerEntitlementInitOptions,
	});
	const operations: BatchTransitionOperations = {
		basePrice: basePriceOperation,
		customerEntitlementCycles,
		entitlementPrices: entitlementPriceOperations,
	};
	const unhandledTransitions: EntitlementIdTransition[] =
		unhandled.transitions.flatMap(
			({ fromEntitlementPrice, toEntitlementPrice }) => {
				const fromEntitlementId = fromEntitlementPrice.entitlement.id;
				const toEntitlementId = toEntitlementPrice.entitlement.id;
				return fromEntitlementId === toEntitlementId
					? []
					: [{ fromEntitlementId, toEntitlementId }];
			},
		);

	return { operations, unhandledTransitions };
};
