import {
	type AutumnBillingPlan,
	BillingVersion,
	type DfuFlashedPlan,
	type FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";
import type {
	FlashContext,
	FlashPlanContext,
} from "../setup/setupFlashContext";
import { applyFlashBalances } from "./resolvers/balanceResolver";
import { resolveFlashStatus } from "./resolvers/statusResolver";

const buildCustomerProduct = ({
	ctx,
	flashContext,
	planContext,
}: {
	ctx: AutumnContext;
	flashContext: FlashContext;
	planContext: FlashPlanContext;
}): { customerProduct: FullCusProduct; reportStatus: string } => {
	const { fullCustomer, currentEpochMs } = flashContext;
	const {
		plan,
		fullProduct,
		featureQuantities,
		subscriptionIds,
		billingCycleAnchor,
		processorType,
		stripeHydration,
	} = planContext;

	const statusInfo = resolveFlashStatus({
		plan,
		now: currentEpochMs,
		hydration: stripeHydration,
	});

	// Payload wins; hydrated period-end anchors the cycle only when omitted.
	const resolvedAnchor =
		billingCycleAnchor ?? stripeHydration?.periodEndMs ?? currentEpochMs;

	const customerProduct = initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct,
			featureQuantities,
			resetCycleAnchor: resolvedAnchor,
			billingCycleAnchor: billingCycleAnchor ?? stripeHydration?.periodEndMs,
			trialEndsAt: stripeHydration?.trialEndsAt,
			now: currentEpochMs,
			freeTrial: null,
			billingVersion: BillingVersion.V2,
		},
		initOptions: {
			subscriptionId: subscriptionIds[0],
			keepSubscriptionIds: subscriptionIds.length > 0,
			status: statusInfo.status,
			canceledAt: statusInfo.canceledAt ?? undefined,
			endedAt: statusInfo.endedAt ?? undefined,
			processorType,
			isCustom: false,
		},
	});

	applyFlashBalances({ customerProduct, balances: plan.balances });

	return { customerProduct, reportStatus: statusInfo.reportStatus };
};

export const computeFlashPlan = ({
	ctx,
	flashContext,
}: {
	ctx: AutumnContext;
	flashContext: FlashContext;
}): { autumnBillingPlan: AutumnBillingPlan; flashed: DfuFlashedPlan[] } => {
	const insertCustomerProducts: FullCusProduct[] = [];
	const flashed: DfuFlashedPlan[] = [];

	for (const planContext of flashContext.planContexts) {
		const existing = planContext.existingActiveCustomerProduct;
		if (existing) {
			flashed.push({
				plan_id: planContext.plan.plan_id,
				processor: planContext.processor,
				customer_product_id: existing.id,
				status: existing.status,
				skipped: true,
				reason: "already_active",
			});
			continue;
		}

		const { customerProduct, reportStatus } = buildCustomerProduct({
			ctx,
			flashContext,
			planContext,
		});
		insertCustomerProducts.push(customerProduct);

		flashed.push({
			plan_id: planContext.plan.plan_id,
			processor: planContext.processor,
			customer_product_id: customerProduct.id,
			status: reportStatus,
			skipped: false,
		});
	}

	return {
		autumnBillingPlan: {
			customerId:
				flashContext.fullCustomer.id ?? flashContext.fullCustomer.internal_id,
			insertCustomerProducts,
		},
		flashed,
	};
};
