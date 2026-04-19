import type {
	AutumnBillingPlan,
	CreateScheduleBillingContext,
	FullCusProduct,
} from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachNewCustomerProduct } from "@/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct";
import { productContextToAttachBillingContext } from "@/internal/billing/v2/utils/billingContext/productContextToAttachBillingContext";
import { applyScheduleTimingToCustomerProductPlan } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";

type CustomerProductUpdate = NonNullable<
	AutumnBillingPlan["updateCustomerProducts"]
>[number];

const expireCurrentRecurringCustomerProducts = ({
	customerProducts,
	currentEpochMs,
}: {
	customerProducts: FullCusProduct[];
	currentEpochMs: number;
}): CustomerProductUpdate[] =>
	customerProducts.map((customerProduct) => ({
		customerProduct,
		updates: {
			status: CusProductStatus.Expired,
			ended_at: currentEpochMs,
			canceled: true,
			canceled_at: currentEpochMs,
			scheduled_ids: [],
		},
	}));

const insertImmediateCustomerProducts = ({
	ctx,
	billingContext,
	expiredCustomerProducts,
	nextPhaseStartsAt,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	expiredCustomerProducts: FullCusProduct[];
	nextPhaseStartsAt: number | undefined;
}): FullCusProduct[] =>
	billingContext.productContexts.map((productContext) => {
		const expiredSameProduct = expiredCustomerProducts.find(
			(customerProduct) =>
				customerProduct.product.id === productContext.fullProduct.id,
		);

		const attachBillingContext = productContextToAttachBillingContext({
			billingContext,
			productContext,
			currentCustomerProductOverride: expiredSameProduct,
		});

		const newCustomerProduct = computeAttachNewCustomerProduct({
			ctx,
			attachBillingContext,
		});

		if (expiredSameProduct) {
			newCustomerProduct.starts_at = expiredSameProduct.starts_at;
		}

		applyScheduleTimingToCustomerProductPlan({
			result: { insertCustomerProduct: newCustomerProduct },
			endedAt: nextPhaseStartsAt ?? null,
		});

		return newCustomerProduct;
	});

/** Compute the immediate-phase customer product expirations and insertions. */
export const computeImmediatePhaseCustomerProducts = ({
	ctx,
	billingContext,
	currentRecurringCustomerProducts,
	nextPhaseStartsAt,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	currentRecurringCustomerProducts: FullCusProduct[];
	nextPhaseStartsAt: number | undefined;
}) => {
	const updateCustomerProducts = expireCurrentRecurringCustomerProducts({
		customerProducts: currentRecurringCustomerProducts,
		currentEpochMs: billingContext.currentEpochMs,
	});

	const insertCustomerProducts = insertImmediateCustomerProducts({
		ctx,
		billingContext,
		expiredCustomerProducts: currentRecurringCustomerProducts,
		nextPhaseStartsAt,
	});

	return { insertCustomerProducts, updateCustomerProducts };
};
