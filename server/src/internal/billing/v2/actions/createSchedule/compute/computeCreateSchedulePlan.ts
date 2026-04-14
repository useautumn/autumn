import type {
	AttachBillingContext,
	AutumnBillingPlan,
	CreateScheduleParamsV0,
	FullCusProduct,
	MultiAttachBillingContext,
} from "@autumn/shared";
import {
	CusProductStatus,
	customerProductHasActiveStatus,
	isCustomerProductOneOff,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachNewCustomerProduct } from "@/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";
import { applyCustomerProductUpdate } from "@/internal/billing/v2/utils/billingPlan/customerProductMutations";

export type CreateSchedulePlanResult = {
	autumnBillingPlan: AutumnBillingPlan;
	immediatePhaseCustomerProducts: FullCusProduct[];
};

const getExpireCustomerProductUpdate = ({
	customerProduct,
	currentEpochMs,
}: {
	customerProduct: FullCusProduct;
	currentEpochMs: number;
}) => ({
	customerProduct,
	updates: {
		status: CusProductStatus.Expired,
		ended_at: currentEpochMs,
		canceled: true,
		canceled_at: currentEpochMs,
		scheduled_ids: [],
	},
});

const planReusesCurrentCustomerProduct = ({
	plan,
}: {
	plan: CreateScheduleParamsV0["phases"][number]["plans"][number];
}) =>
	plan.customize === undefined &&
	(plan.feature_quantities === undefined ||
		plan.feature_quantities.length === 0);

/** Compute the exact immediate phase for create_schedule. */
export const computeCreateSchedulePlan = ({
	ctx,
	billingContext,
	immediatePhase,
	nextPhaseStartsAt,
}: {
	ctx: AutumnContext;
	billingContext: MultiAttachBillingContext;
	immediatePhase: CreateScheduleParamsV0["phases"][number];
	nextPhaseStartsAt?: number;
}): CreateSchedulePlanResult => {
	const currentRecurringCustomerProducts =
		billingContext.fullCustomer.customer_products.filter(
			(customerProduct) =>
				customerProductHasActiveStatus(customerProduct) &&
				!isCustomerProductOneOff(customerProduct),
		);
	const scheduledRecurringCustomerProducts =
		billingContext.fullCustomer.customer_products.filter(
			(customerProduct) =>
				customerProduct.status === CusProductStatus.Scheduled &&
				!isCustomerProductOneOff(customerProduct),
		);

	const handledCurrentProductIds = new Set<string>();
	const insertCustomerProducts: FullCusProduct[] = [];
	const updateCustomerProducts: NonNullable<
		AutumnBillingPlan["updateCustomerProducts"]
	> = [];
	const expiredCustomerProducts: FullCusProduct[] = [];
	const immediatePhaseCustomerProducts: FullCusProduct[] = [];

	for (const [
		index,
		productContext,
	] of billingContext.productContexts.entries()) {
		const plan = immediatePhase.plans[index];
		if (!plan) continue;

		const sameProductCurrent = currentRecurringCustomerProducts.find(
			(customerProduct) =>
				customerProduct.product.id === productContext.fullProduct.id &&
				!handledCurrentProductIds.has(customerProduct.id),
		);

		if (sameProductCurrent && planReusesCurrentCustomerProduct({ plan })) {
			const updates = {
				ended_at: nextPhaseStartsAt ?? null,
				canceled: false,
				canceled_at: null,
				scheduled_ids: [],
			};

			handledCurrentProductIds.add(sameProductCurrent.id);
			updateCustomerProducts.push({
				customerProduct: sameProductCurrent,
				updates,
			});
			immediatePhaseCustomerProducts.push(
				applyCustomerProductUpdate({
					customerProduct: sameProductCurrent,
					updates,
				}),
			);
			continue;
		}

		const customerProductToReplace =
			sameProductCurrent ?? productContext.currentCustomerProduct;

		if (
			customerProductToReplace &&
			!handledCurrentProductIds.has(customerProductToReplace.id)
		) {
			handledCurrentProductIds.add(customerProductToReplace.id);
			updateCustomerProducts.push(
				getExpireCustomerProductUpdate({
					customerProduct: customerProductToReplace,
					currentEpochMs: billingContext.currentEpochMs,
				}),
			);
			expiredCustomerProducts.push(customerProductToReplace);
		}

		const attachBillingContext: AttachBillingContext = {
			...billingContext,
			attachProduct: productContext.fullProduct,
			fullProducts: [productContext.fullProduct],
			featureQuantities: productContext.featureQuantities,
			customPrices: productContext.customPrices,
			customEnts: productContext.customEnts,
			currentCustomerProduct: customerProductToReplace,
			scheduledCustomerProduct: productContext.scheduledCustomerProduct,
			planTiming: "immediate",
			externalId: productContext.externalId,
		};
		const newCustomerProduct = computeAttachNewCustomerProduct({
			ctx,
			attachBillingContext,
		});

		newCustomerProduct.ended_at = nextPhaseStartsAt ?? null;
		newCustomerProduct.scheduled_ids = [];

		insertCustomerProducts.push(newCustomerProduct);
		immediatePhaseCustomerProducts.push(newCustomerProduct);
	}

	for (const customerProduct of currentRecurringCustomerProducts) {
		if (handledCurrentProductIds.has(customerProduct.id)) continue;

		handledCurrentProductIds.add(customerProduct.id);
		updateCustomerProducts.push(
			getExpireCustomerProductUpdate({
				customerProduct,
				currentEpochMs: billingContext.currentEpochMs,
			}),
		);
		expiredCustomerProducts.push(customerProduct);
	}

	const { allLineItems, updateCustomerEntitlements } = buildAutumnLineItems({
		ctx,
		newCustomerProducts: insertCustomerProducts,
		deletedCustomerProducts: expiredCustomerProducts,
		billingContext,
		includeArrearLineItems: expiredCustomerProducts.length > 0,
	});

	const autumnBillingPlan: AutumnBillingPlan = {
		customerId:
			billingContext.fullCustomer.id ?? billingContext.fullCustomer.internal_id,
		insertCustomerProducts,
		updateCustomerProducts:
			updateCustomerProducts.length > 0 ? updateCustomerProducts : undefined,
		deleteCustomerProducts:
			scheduledRecurringCustomerProducts.length > 0
				? scheduledRecurringCustomerProducts
				: undefined,
		customPrices: billingContext.customPrices,
		customEntitlements: billingContext.customEnts,
		customFreeTrial: billingContext.trialContext?.customFreeTrial,
		lineItems: allLineItems,
		updateCustomerEntitlements,
	};

	autumnBillingPlan.lineItems = finalizeLineItems({
		ctx,
		lineItems: autumnBillingPlan.lineItems ?? [],
		billingContext,
		autumnBillingPlan,
	});

	return {
		autumnBillingPlan,
		immediatePhaseCustomerProducts,
	};
};
