import {
	cusProductToPrices,
	type Entity,
	type FullCusProduct,
	type LineItem,
	type SetPlansPreviewPlan,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { customerProductToEntityId } from "@/internal/billing/v2/actions/buildBillingChanges/buildCustomerPlanChanges/customerProductToEntityId";
import type { TimelineTransition } from "../../timeline/types/timelineDiff";
import { autumnPriceToProcessorItemPrice } from "../processorItems/price/autumnPriceToProcessorItemPrice";
import {
	sideCustomerProduct,
	type TransitionRowLookup,
	transitionPredecessor,
	transitionSubject,
} from "./transitionCustomerProducts";

const transitionStatus = (
	transition: TimelineTransition,
): SetPlansPreviewPlan["status"] => {
	switch (transition.kind) {
		case "starts":
			return "starts";
		case "ends":
			return "ends";
		case "updated":
			return "updated";
		case "switches":
			return "switches";
		case "continues":
			return "kept";
		default: {
			const unreachable: never = transition;
			return unreachable;
		}
	}
};

/** The saved row a request change ends now, which is what any credit is for. */
const rowEndedNow = ({
	transition,
	now,
}: {
	transition: TimelineTransition;
	now: number;
}) => {
	if (transition.at !== now || transition.origin !== "request") {
		return undefined;
	}
	switch (transition.kind) {
		case "starts":
		case "continues":
			return undefined;
		case "ends":
		case "updated":
		case "switches":
			return transition.from.ref.source === "saved"
				? transition.from.ref.customerProductId
				: undefined;
		default: {
			const unreachable: never = transition;
			return unreachable;
		}
	}
};

/** Unused time credited for a plan the request ends now. */
const endedPlanCredit = ({
	transition,
	creditLineItems,
	now,
}: {
	transition: TimelineTransition;
	creditLineItems: LineItem[];
	now: number;
}) => {
	const endedCustomerProductId = rowEndedNow({ transition, now });
	if (!endedCustomerProductId) return null;

	const credit = creditLineItems
		.filter(
			(lineItem) =>
				lineItem.context.customerProduct?.id === endedCustomerProductId,
		)
		.reduce(
			(sum, lineItem) => sum.plus(lineItem.amountAfterDiscounts),
			new Decimal(0),
		);
	return credit.isZero() ? null : credit.toDP(2).toNumber();
};

const pricesOf = ({
	customerProduct,
	currency,
}: {
	customerProduct: FullCusProduct;
	currency: string;
}) =>
	cusProductToPrices({ cusProduct: customerProduct }).map((price) => ({
		feature_id: price.config.feature_id ?? null,
		price: autumnPriceToProcessorItemPrice({ price, currency }),
	}));

/** One review row: what happens to a plan at a boundary, and whether this request causes it. */
export const transitionToPreviewPlan = ({
	transition,
	lookup,
	creditLineItems,
	entities,
	currency,
	now,
}: {
	transition: TimelineTransition;
	lookup: TransitionRowLookup;
	creditLineItems: LineItem[];
	entities: Entity[];
	currency: string;
	now: number;
}): SetPlansPreviewPlan | undefined => {
	const customerProduct = sideCustomerProduct({
		side: transitionSubject(transition),
		lookup,
	});
	if (!customerProduct) return undefined;

	return {
		plan_id: customerProduct.product_id,
		entity_id: customerProductToEntityId({ customerProduct, entities }),
		name: customerProduct.product.name,
		status: transitionStatus(transition),
		origin: transition.origin,
		previous_plan_id: transitionPredecessor(transition)?.planId ?? null,
		custom: customerProduct.is_custom,
		expires_at: customerProduct.ended_at ?? null,
		trial_ends_at: customerProduct.trial_ends_at ?? null,
		credit: endedPlanCredit({ transition, creditLineItems, now }),
		prices: pricesOf({ customerProduct, currency }),
	};
};
