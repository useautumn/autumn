import {
	cusProductToPrices,
	type Entity,
	type FullCusProduct,
	type LineItem,
	type SetPlansPreviewPlan,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { customerProductToEntityId } from "@/internal/billing/v2/actions/buildBillingChanges/buildCustomerPlanChanges/customerProductToEntityId";
import { autumnPriceToProcessorItemPrice } from "../processorItems/price/autumnPriceToProcessorItemPrice";
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

const isOngoingRow = (row: ReviewPlanRow) =>
	row.status !== "ends" &&
	row.after.source === "resolved" &&
	row.after.segment.desired?.source.type === "ongoing";

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

/** One review row; a removed plan expires at the phase start, the others when their segment ends. */
export const reviewRowToPreviewPlan = ({
	row,
	phaseStartsAt,
	lookup,
	creditLineItems,
	entities,
	currency,
}: {
	row: ReviewPlanRow;
	phaseStartsAt: number;
	lookup: ReviewRowLookup;
	creditLineItems: LineItem[];
	entities: Entity[];
	currency: string;
}): SetPlansPreviewPlan | undefined => {
	const customerProduct = reviewSegmentCustomerProduct({
		reviewSegment: row.status === "ends" ? row.before : row.after,
		lookup,
	});
	if (!customerProduct) return undefined;

	return {
		plan_id: customerProduct.product_id,
		entity_id: customerProductToEntityId({ customerProduct, entities }),
		name: customerProduct.product.name,
		status: row.status,
		custom: customerProduct.is_custom,
		ongoing: isOngoingRow(row),
		expires_at:
			row.status === "ends"
				? phaseStartsAt
				: (customerProduct.ended_at ?? null),
		trial_ends_at: customerProduct.trial_ends_at ?? null,
		credit: replacedPlanCredit({ row, creditLineItems }),
		prices: pricesOf({ customerProduct, currency }),
	};
};
