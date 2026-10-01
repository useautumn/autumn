import {
	cusProductToPrices,
	customerProductHasActiveStatus,
	type Entity,
	type Feature,
	type FullCusProduct,
	type FullCustomer,
	findCustomerProductById,
	type LineItem,
	type SetPlansPreviewPlan,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { customerProductToEntityId } from "@/internal/billing/v2/actions/buildBillingChanges/buildCustomerPlanChanges/customerProductToEntityId";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import { diffPhasePlans, type PhasePlanDiff } from "./diffPhasePlans";
import { autumnPriceToProcessorItemPrice } from "./processorItems/price/autumnPriceToProcessorItemPrice";
import {
	isSavedPhaseStart,
	savedCustomerProductsAt,
} from "./savedCustomerProductsAt";

const IMMEDIATE_PHASE_INDEX = 0;

const planCredit = ({
	customerProduct,
	creditLineItems,
}: {
	customerProduct: FullCusProduct;
	creditLineItems: LineItem[];
}) => {
	const credit = creditLineItems
		.filter(
			(lineItem) => lineItem.context.customerProduct?.id === customerProduct.id,
		)
		.reduce(
			(sum, lineItem) => sum.plus(lineItem.amountAfterDiscounts),
			new Decimal(0),
		);
	return credit.isZero() ? null : credit.toDP(2).toNumber();
};

/** An ending plan shows the phase's copy of its row, which carries the end date the request gives it. */
const diffToCustomerProduct = ({
	diff,
	phaseCustomer,
}: {
	diff: PhasePlanDiff;
	phaseCustomer: FullCustomer;
}): FullCusProduct => {
	if (diff.status !== "ends") return diff.after;
	return (
		findCustomerProductById({
			fullCustomer: phaseCustomer,
			customerProductId: diff.before.id,
		}) ?? diff.before
	);
};

const replacedPlanCredit = ({
	diff,
	phaseIndex,
	creditLineItems,
}: {
	diff: PhasePlanDiff;
	phaseIndex: number;
	creditLineItems: LineItem[];
}) => {
	if (phaseIndex !== IMMEDIATE_PHASE_INDEX) return null;
	if (diff.status !== "ends" && diff.status !== "updated") return null;
	return planCredit({ customerProduct: diff.before, creditLineItems });
};

const toPreviewPlan = ({
	customerProduct,
	status,
	credit,
	entities,
	currency,
}: {
	customerProduct: FullCusProduct;
	status: SetPlansPreviewPlan["status"];
	credit: number | null;
	entities: Entity[];
	currency: string;
}): SetPlansPreviewPlan => ({
	plan_id: customerProduct.product_id,
	entity_id: customerProductToEntityId({ customerProduct, entities }),
	name: customerProduct.product.name,
	status,
	custom: customerProduct.is_custom,
	expires_at: customerProduct.ended_at ?? null,
	trial_ends_at: customerProduct.trial_ends_at ?? null,
	credit,
	prices: cusProductToPrices({ cusProduct: customerProduct }).map((price) => ({
		feature_id: price.config.feature_id ?? null,
		price: autumnPriceToProcessorItemPrice({ price, currency }),
	})),
});

const activeCustomerProducts = (fullCustomer: FullCustomer) =>
	fullCustomer.customer_products.filter(customerProductHasActiveStatus);

/** A saved phase diffs against the saved state; a new phase only against the previous request phase, without removals. */
/** A newly added phase only starts plans: a changed plan is a new version starting, and nothing ends. */
const newPhaseDiff = (diff: PhasePlanDiff): PhasePlanDiff[] => {
	if (diff.status === "ends") return [];
	if (diff.status === "updated") {
		return [{ status: "starts", before: null, after: diff.after }];
	}
	return [diff];
};

const phaseDiffs = ({
	phase,
	phaseIndex,
	phaseCustomers,
	originalFullCustomer,
	features,
}: {
	phase: SchedulePhasePlan;
	phaseIndex: number;
	phaseCustomers: FullCustomer[];
	originalFullCustomer: FullCustomer;
	features: Feature[];
}): PhasePlanDiff[] => {
	const after = activeCustomerProducts(phaseCustomers[phaseIndex]);
	const isSavedPhase =
		phaseIndex === IMMEDIATE_PHASE_INDEX ||
		isSavedPhaseStart({
			fullCustomer: originalFullCustomer,
			at: phase.startsAt,
		});

	if (isSavedPhase) {
		return diffPhasePlans({
			features,
			before: savedCustomerProductsAt({
				fullCustomer: originalFullCustomer,
				at: phase.startsAt,
			}),
			after,
		});
	}

	return diffPhasePlans({
		features,
		before: activeCustomerProducts(phaseCustomers[phaseIndex - 1]),
		after,
	}).flatMap(newPhaseDiff);
};

const isOutOfScope = ({
	diff,
	outOfScopeCustomerProductIds,
}: {
	diff: PhasePlanDiff;
	outOfScopeCustomerProductIds: Set<string>;
}) =>
	[diff.before, diff.after].some(
		(customerProduct) =>
			customerProduct && outOfScopeCustomerProductIds.has(customerProduct.id),
	);

/** Every in-scope plan in each phase, classified against the saved state, or the previous phase for a newly added one. */
export const setPlansPhasePlans = ({
	phases,
	outOfScopeCustomerProductIds,
	phaseCustomers,
	originalFullCustomer,
	features,
	creditLineItems,
	currency,
}: {
	phases: SchedulePhasePlan[];
	outOfScopeCustomerProductIds: Set<string>;
	phaseCustomers: FullCustomer[];
	originalFullCustomer: FullCustomer;
	features: Feature[];
	creditLineItems: LineItem[];
	currency: string;
}): SetPlansPreviewPlan[][] =>
	phases.map((phase, phaseIndex) => {
		const phaseCustomer = phaseCustomers[phaseIndex];
		const diffs = phaseDiffs({
			phase,
			phaseIndex,
			phaseCustomers,
			originalFullCustomer,
			features,
		});

		return diffs
			.filter((diff) => !isOutOfScope({ diff, outOfScopeCustomerProductIds }))
			.map((diff) =>
				toPreviewPlan({
					customerProduct: diffToCustomerProduct({ diff, phaseCustomer }),
					status: diff.status,
					credit: replacedPlanCredit({ diff, phaseIndex, creditLineItems }),
					entities: originalFullCustomer.entities,
					currency,
				}),
			);
	});
