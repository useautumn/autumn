import {
	ACTIVE_STATUSES,
	type AutumnBillingPlan,
	BillingVersion,
	CusProductStatus,
	cusProductToProcessorType,
	type DfuFlashedPlan,
	type FullCusProduct,
	isCustomerProductCustomerScoped,
	ProcessorType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";
import type {
	FlashContext,
	FlashPlanContext,
} from "../setup/setupFlashContext";
import { applyFlashBalances } from "./resolvers/balanceResolver";
import { resolveFlashStatus } from "./resolvers/statusResolver";

type CustomerProductUpdate = NonNullable<
	AutumnBillingPlan["updateCustomerProducts"]
>[number];

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
		revenueCatHydration,
	} = planContext;

	// Exactly one processor hydration applies per billable; both share the shape.
	const hydration = stripeHydration ?? revenueCatHydration;
	const resolvedStartsAt = plan.started_at ?? hydration?.startsAt;

	const statusInfo = resolveFlashStatus({
		plan,
		now: currentEpochMs,
		hydration,
	});

	// Payload wins; hydrated period-end, else the plan start, anchors the cycle.
	const resolvedAnchor =
		billingCycleAnchor ??
		hydration?.periodEndMs ??
		resolvedStartsAt ??
		currentEpochMs;

	const customerProduct = initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct,
			featureQuantities,
			resetCycleAnchor: resolvedAnchor,
			billingCycleAnchor: billingCycleAnchor ?? hydration?.periodEndMs,
			trialEndsAt: hydration?.trialEndsAt,
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
			startsAt: resolvedStartsAt,
			processorType,
			isCustom: false,
		},
	});

	// Stamp the resolved RC sub/purchase id on the cusProduct processor.
	if (revenueCatHydration?.processorId) {
		customerProduct.processor = {
			...customerProduct.processor,
			type: ProcessorType.RevenueCat,
			id: revenueCatHydration.processorId,
		};
	}

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
	const { currentEpochMs } = flashContext;
	const insertCustomerProducts: FullCusProduct[] = [];
	const updateCustomerProducts: CustomerProductUpdate[] = [];
	const flashed: DfuFlashedPlan[] = [];

	// Desired state = the plans in the payload, keyed by their product's internal id.
	const desiredInternalProductIds = new Set(
		flashContext.planContexts.map(
			(planContext) => planContext.fullProduct.internal_id,
		),
	);

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

	// Reconcile to desired state: expire customer-level active products absent
	// from the payload. Entity-scoped products are left for the entity phase.
	for (const customerProduct of flashContext.fullCustomer.customer_products) {
		const isActive = ACTIVE_STATUSES.includes(customerProduct.status);
		const isDesired = desiredInternalProductIds.has(
			customerProduct.internal_product_id,
		);
		if (
			!isActive ||
			isDesired ||
			!isCustomerProductCustomerScoped(customerProduct)
		) {
			continue;
		}

		updateCustomerProducts.push({
			customerProduct,
			updates: {
				status: CusProductStatus.Expired,
				ended_at: currentEpochMs,
				canceled: true,
				canceled_at: currentEpochMs,
			},
		});

		flashed.push({
			plan_id: customerProduct.product_id,
			processor: cusProductToProcessorType(customerProduct) ?? "stripe",
			customer_product_id: customerProduct.id,
			status: CusProductStatus.Expired,
			skipped: false,
			expired: true,
			reason: "expired_not_in_desired_state",
		});
	}

	return {
		autumnBillingPlan: {
			customerId:
				flashContext.fullCustomer.id ?? flashContext.fullCustomer.internal_id,
			insertCustomerProducts,
			updateCustomerProducts,
		},
		flashed,
	};
};
