import {
	CusProductStatus,
	type CustomerPlanChange,
	cp,
	cusProductToPrices,
	type Entity,
	type FullCusProduct,
	type FullCustomer,
	type LineItem,
	type SetPlansPreviewPlan,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	type CustomerProductTransition,
	deriveCustomerPlanChangeAction,
} from "@/internal/billing/v2/actions/buildBillingChanges/buildCustomerPlanChanges/buildCustomerPlanChange";
import { customerProductToEntityId } from "@/internal/billing/v2/actions/buildBillingChanges/buildCustomerPlanChanges/customerProductToEntityId";
import { autumnPriceToProcessorItemPrice } from "./processorItems/price/autumnPriceToProcessorItemPrice";

const PLAN_STATUS: Record<
	CustomerPlanChange["action"],
	SetPlansPreviewPlan["status"]
> = {
	activated: "starts",
	scheduled: "starts",
	expired: "ends",
	updated: "updated",
};

const isActive = (customerProduct: FullCusProduct) =>
	cp(customerProduct).hasActiveStatus().valid;

/** An untouched row the customer already had scheduled: it starting on schedule is not a change. */
const isAlreadyScheduled = ({
	customerProduct,
	originalFullCustomer,
}: {
	customerProduct: FullCusProduct;
	originalFullCustomer: FullCustomer;
}) =>
	originalFullCustomer.customer_products.some(
		(original) =>
			original.id === customerProduct.id &&
			original.status === CusProductStatus.Scheduled,
	);

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

/** Every plan each phase touches or keeps active, with its prices and any credit for ending now. */
export const setPlansPhasePlans = ({
	phaseTransitions,
	phaseCustomers,
	originalFullCustomer,
	creditLineItems,
	currency,
}: {
	phaseTransitions: CustomerProductTransition[][];
	phaseCustomers: FullCustomer[];
	originalFullCustomer: FullCustomer;
	creditLineItems: LineItem[];
	currency: string;
}): SetPlansPreviewPlan[][] =>
	phaseTransitions.map((transitions, phaseIndex) => {
		const entities = originalFullCustomer.entities;
		const previousCustomer =
			phaseIndex === 0 ? originalFullCustomer : phaseCustomers[phaseIndex - 1];
		const changedPlans = new Map<string, SetPlansPreviewPlan>();
		for (const { before, after } of transitions) {
			if (!after || changedPlans.has(after.id)) continue;
			changedPlans.set(
				after.id,
				toPreviewPlan({
					customerProduct: after,
					status:
						PLAN_STATUS[deriveCustomerPlanChangeAction({ before, after })],
					credit:
						phaseIndex === 0 && before
							? planCredit({ customerProduct: before, creditLineItems })
							: null,
					entities,
					currency,
				}),
			);
		}

		const touchedIds = new Set(
			transitions.flatMap(({ before, after }) => [before?.id, after?.id]),
		);
		const keptPlans = phaseCustomers[phaseIndex].customer_products
			.filter(
				(customerProduct) =>
					!touchedIds.has(customerProduct.id) &&
					isActive(customerProduct) &&
					(isAlreadyScheduled({ customerProduct, originalFullCustomer }) ||
						previousCustomer.customer_products.some(
							(previous) =>
								previous.id === customerProduct.id && isActive(previous),
						)),
			)
			.map((customerProduct) =>
				toPreviewPlan({
					customerProduct,
					status: "kept",
					credit: null,
					entities,
					currency,
				}),
			);

		return [...changedPlans.values(), ...keptPlans];
	});
