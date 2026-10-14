import type {
	BillingPeriod,
	CreateScheduleBillingContext,
	FullCusProduct,
	LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductToLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToLineItems";
import { backdateGap, billsProratedTime } from "../utils/backdateGap";
import type { SetPlansCustomerProductChanges } from "./diffToCustomerProducts/diffToCustomerProducts";

type PlanRun = {
	customerProduct: FullCusProduct;
	startsAt: number;
	endsAt?: number | null;
};

const plansFromBackdatedStart = ({
	customerProductChanges,
	backdatedStartMs,
}: {
	customerProductChanges: SetPlansCustomerProductChanges;
	backdatedStartMs: number;
}): PlanRun[] => [
	...customerProductChanges.immediateInsertCustomerProducts.map(
		(customerProduct) => ({
			customerProduct,
			startsAt: customerProduct.starts_at,
			endsAt: customerProduct.ended_at,
		}),
	),
	...customerProductChanges.updateCustomerProducts
		.filter(({ updates }) => updates.starts_at === backdatedStartMs)
		.map(({ customerProduct, updates }) => ({
			customerProduct,
			startsAt: backdatedStartMs,
			endsAt:
				updates.ended_at === undefined
					? customerProduct.ended_at
					: updates.ended_at,
		})),
];

const planRunInGap = ({
	planRun,
	gap,
}: {
	planRun: PlanRun;
	gap: BillingPeriod;
}): BillingPeriod | undefined => {
	const start = Math.max(gap.start, planRun.startsAt);
	const end = Math.min(gap.end, planRun.endsAt ?? gap.end);
	return start < end ? { start, end } : undefined;
};

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
	if (!gap || !billsProratedTime({ billingContext })) return [];

	return plansFromBackdatedStart({
		customerProductChanges,
		backdatedStartMs: gap.start,
	}).flatMap((planRun) => {
		const runInGap = planRunInGap({ planRun, gap });
		if (!runInGap) return [];

		return customerProductToLineItems({
			ctx,
			customerProduct: planRun.customerProduct,
			billingContext,
			direction: "charge",
			priceFilters: { excludeOneOffPrices: true },
			backdateGapRun: { gap, run: runInGap },
		});
	});
};
