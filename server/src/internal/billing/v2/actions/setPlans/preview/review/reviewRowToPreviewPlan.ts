import {
	cusProductToEnts,
	cusProductToPrices,
	type Entity,
	type FullCusProduct,
	type LineItem,
	type Organization,
	priceToEnt,
	type SetPlansPreviewPlan,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { customerProductToEntityId } from "@/internal/billing/v2/actions/buildBillingChanges/buildCustomerPlanChanges/customerProductToEntityId";
import { autumnPriceToProcessorItemPrice } from "../processorItems/price/autumnPriceToProcessorItemPrice";
import {
	isOngoingReviewSegment,
	type OngoingContext,
} from "./isOngoingReviewSegment";
import {
	type ReviewRowLookup,
	reviewSegmentCustomerProduct,
	savedRowAt,
} from "./reviewSegmentCustomerProduct";
import type { ReviewPlanRow } from "./types/reviewPhase";

/** The saved row a removed or updated plan ran on, which is what any credit is for. */
const replacedSavedRowId = (row: ReviewPlanRow) => {
	if (!("before" in row) || row.status === "kept") return undefined;
	if (row.before.source !== "saved") return undefined;
	return savedRowAt({ segment: row.before.segment, at: row.before.at })
		?.customerProductId;
};

const replacedPlanCredit = ({
	row,
	creditLineItems,
}: {
	row: ReviewPlanRow;
	creditLineItems: LineItem[];
}) => {
	const customerProductId = replacedSavedRowId(row);
	if (!customerProductId) return null;

	const credit = creditLineItems
		.filter(
			(lineItem) => lineItem.context.customerProduct?.id === customerProductId,
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
	org,
}: {
	customerProduct: FullCusProduct;
	currency: string;
	org: Organization;
}) => {
	const entitlements = cusProductToEnts({ cusProduct: customerProduct });
	return cusProductToPrices({ cusProduct: customerProduct }).map((price) => ({
		feature_id: price.config.feature_id ?? null,
		price: autumnPriceToProcessorItemPrice({
			price,
			entitlement: priceToEnt({ price, entitlements }),
			org,
			currency,
		}),
	}));
};

/** One review row; a removed plan expires at endsAt, the others when their segment ends. */
export const reviewRowToPreviewPlan = ({
	row,
	endsAt,
	lookup,
	creditLineItems,
	entities,
	currency,
	org,
	ongoingContext,
}: {
	row: ReviewPlanRow;
	endsAt: number;
	lookup: ReviewRowLookup;
	creditLineItems: LineItem[];
	entities: Entity[];
	currency: string;
	org: Organization;
	ongoingContext: OngoingContext;
}): SetPlansPreviewPlan | undefined => {
	const reviewSegment = row.status === "ends" ? row.before : row.after;
	const customerProduct = reviewSegmentCustomerProduct({
		reviewSegment,
		lookup,
	});
	if (!customerProduct) return undefined;

	return {
		plan_id: customerProduct.product_id,
		entity_id: customerProductToEntityId({ customerProduct, entities }),
		name: customerProduct.product.name,
		status: row.status,
		custom: customerProduct.is_custom,
		ongoing: isOngoingReviewSegment({ reviewSegment, ongoingContext }),
		expires_at:
			row.status === "ends" ? endsAt : (customerProduct.ended_at ?? null),
		trial_ends_at: customerProduct.trial_ends_at ?? null,
		credit: replacedPlanCredit({ row, creditLineItems }),
		prices: pricesOf({ customerProduct, currency, org }),
	};
};
