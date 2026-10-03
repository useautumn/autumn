import type {
	CreateScheduleBillingContext,
	FullCusProduct,
	LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductToLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToLineItems";
import { backdateGap, billsBackdateGap } from "../utils/backdateGap";
import type { SetPlansCustomerProductChanges } from "./diffToCustomerProducts/diffToCustomerProducts";

/** The plans the recreated subscription runs from the backdated start: new rows, and kept rows moved back to it. */
const plansFromBackdatedStart = ({
	customerProductChanges,
	backdatedStartMs,
}: {
	customerProductChanges: SetPlansCustomerProductChanges;
	backdatedStartMs: number;
}): FullCusProduct[] => [
	...customerProductChanges.immediateInsertCustomerProducts,
	...customerProductChanges.updateCustomerProducts
		.filter(({ updates }) => updates.starts_at === backdatedStartMs)
		.map(({ customerProduct }) => customerProduct),
];

/** Charges the backdated time before the replaced subscription started, per proration_behavior. */
export const backdateGapLineItems = ({
	ctx,
	billingContext,
	customerProductChanges,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	customerProductChanges: SetPlansCustomerProductChanges;
}): LineItem[] => {
	const gap = backdateGap({ billingContext });
	if (!gap || !billsBackdateGap({ billingContext })) return [];

	return plansFromBackdatedStart({
		customerProductChanges,
		backdatedStartMs: gap.start,
	}).flatMap((customerProduct) =>
		customerProductToLineItems({
			ctx,
			// Seat licenses bill their own current cycle, which would charge now rather than the gap.
			customerProduct: { ...customerProduct, customer_licenses: [] },
			billingContext,
			direction: "charge",
			priceFilters: { excludeOneOffPrices: true },
			backdateGap: gap,
		}),
	);
};
