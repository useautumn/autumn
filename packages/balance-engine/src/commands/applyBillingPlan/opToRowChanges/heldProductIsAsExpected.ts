import type { ExpectedProduct } from "../types/billingPlanOp.js";
import {
	type PlanRowChangeContext,
	wasDeletedByPlan,
} from "./planRowChangeContext.js";
import { rowHoldsExpectedColumns } from "./rowHoldsExpectedColumns.js";

const heldCustomerPriceIds = ({
	context,
	customerProductId,
}: {
	context: PlanRowChangeContext;
	customerProductId: string;
}): string[] =>
	(context.state?.customerPrices ?? [])
		.filter(
			(price) =>
				price.customer_product_id === customerProductId &&
				!wasDeletedByPlan({ context, table: "customerPrices", id: price.id }),
		)
		.map(({ id }) => id);

const holdsExactly = ({
	held,
	expected,
}: {
	held: string[];
	expected: string[];
}): boolean =>
	held.length === expected.length && expected.every((id) => held.includes(id));

export const heldProductIsAsExpected = ({
	context,
	customerProductId,
	expectProduct,
}: {
	context: PlanRowChangeContext;
	customerProductId: string | null | undefined;
	expectProduct: ExpectedProduct | undefined;
}): boolean => {
	if (!expectProduct) return true;
	if (!customerProductId) return false;
	if (
		wasDeletedByPlan({
			context,
			table: "customerProducts",
			id: customerProductId,
		})
	)
		return false;
	const product = context.state?.customerProducts.find(
		({ id }) => id === customerProductId,
	);
	if (!product) return false;
	if (!rowHoldsExpectedColumns({ row: product, expect: expectProduct.columns }))
		return false;
	return holdsExactly({
		held: heldCustomerPriceIds({ context, customerProductId }),
		expected: expectProduct.customerPriceIds,
	});
};
