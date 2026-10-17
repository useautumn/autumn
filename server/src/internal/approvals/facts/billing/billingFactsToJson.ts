import type { FullCusProduct, FullProduct } from "@autumn/shared";
import { planFilterMatchesProduct } from "@autumn/shared/api/products/utils/match/index.js";
import type { BillingApprovalFacts } from "@/internal/approvals/check/types/billingApprovalOutcome";

// Read through the evaluator's own matcher, so the view can't disagree with a verdict.
const productToJson = ({ product }: { product: FullProduct }) => ({
	plan_id: product.id,
	version: product.version ?? null,
	paid: planFilterMatchesProduct({ filter: { paid: true }, product }),
	recurring: planFilterMatchesProduct({ filter: { recurring: true }, product }),
	addon: product.is_add_on,
});

const customerProductToJson = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}) => ({
	plan_id: customerProduct.product.id,
	version: customerProduct.product.version ?? null,
});

/** Facts as JSON: rows replaced by the plan fields rules read, for the test header and the decision log. */
export const billingFactsToJson = ({
	facts,
}: {
	facts: BillingApprovalFacts;
}) => {
	const { customer, outgoing, ...rest } = facts;
	const base = {
		customer: { id: customer.id, has_paid: customer.has_paid },
		outgoing: outgoing.map((customerProduct) =>
			customerProductToJson({ customerProduct }),
		),
	};
	if (!("incoming" in rest)) return { ...base, ...rest };

	return {
		...base,
		...rest,
		incoming: rest.incoming.map(({ product, ...incoming }) => ({
			...productToJson({ product }),
			...incoming,
		})),
	};
};
