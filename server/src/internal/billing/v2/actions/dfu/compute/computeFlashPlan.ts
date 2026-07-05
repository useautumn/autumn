import {
	ACTIVE_STATUSES,
	type AutumnBillingPlan,
	BillingVersion,
	CusProductStatus,
	cusProductToProcessorType,
	type DfuFlashedPlan,
	type FullCusProduct,
	isProductPaidAndRecurring,
	isResettingEntitlement,
	nullish,
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
}): {
	customerProduct: FullCusProduct;
	reportStatus: string;
	mismatchReason: string | undefined;
} => {
	const { fullCustomer, currentEpochMs } = flashContext;
	const {
		plan,
		fullProduct,
		featureQuantities,
		subscriptionIds,
		billingCycleAnchor,
		processorType,
		internalEntityId,
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

	// Flags (don't block) surfaced to the caller as `mismatch` — the plan images
	// anyway, but its billing state is likely wrong and needs attention.
	const anchorResolved =
		billingCycleAnchor != null ||
		hydration?.periodEndMs != null ||
		resolvedStartsAt != null;
	const anchorMismatch =
		!anchorResolved &&
		fullProduct.entitlements.some((entitlement) =>
			isResettingEntitlement({ entitlement }),
		);
	// A paid recurring plan with no linked subscription can't be billed/managed —
	// Autumn has no processor object to run renewals against.
	const paidPlanUnlinked =
		isProductPaidAndRecurring(fullProduct) && subscriptionIds.length === 0;

	const mismatchReason = paidPlanUnlinked
		? "paid_plan_without_subscription"
		: anchorMismatch
			? "no_resolvable_billing_anchor"
			: undefined;

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
			internalEntityId,
			isCustom: false,
		},
	});

	// Back-date the record to the plan's real start so a migrated plan's created_at
	// (like starts_at) reflects the source, not the import time.
	if (resolvedStartsAt !== undefined) {
		customerProduct.created_at = resolvedStartsAt;
	}

	// Stamp the resolved RC sub/purchase id on the cusProduct processor.
	if (revenueCatHydration?.processorId) {
		customerProduct.processor = {
			...customerProduct.processor,
			type: ProcessorType.RevenueCat,
			id: revenueCatHydration.processorId,
		};
	}

	applyFlashBalances({ customerProduct, balances: plan.balances });

	return {
		customerProduct,
		reportStatus: statusInfo.reportStatus,
		mismatchReason,
	};
};

export const computeFlashPlan = ({
	ctx,
	flashContext,
}: {
	ctx: AutumnContext;
	flashContext: FlashContext;
}): { autumnBillingPlan: AutumnBillingPlan; flashed: DfuFlashedPlan[] } => {
	const { currentEpochMs, fullCustomer, params } = flashContext;
	const insertCustomerProducts: FullCusProduct[] = [];
	const updateCustomerProducts: CustomerProductUpdate[] = [];
	const flashed: DfuFlashedPlan[] = [];

	// Desired state per addressed scope, keyed by the scope's product internal ids.
	const customerDesiredProductIds = new Set<string>();
	const entityDesiredProductIds = new Map<string, Set<string>>();
	for (const planContext of flashContext.planContexts) {
		const productId = planContext.fullProduct.internal_id;
		if (planContext.internalEntityId) {
			const desired =
				entityDesiredProductIds.get(planContext.internalEntityId) ??
				new Set<string>();
			desired.add(productId);
			entityDesiredProductIds.set(planContext.internalEntityId, desired);
		} else {
			customerDesiredProductIds.add(productId);
		}
	}

	// A scope is only reconciled when the payload addresses it: customer-level iff
	// top-level billables exist; an entity iff it appears in `params.entities`.
	const customerLevelAddressed = params.billables.length > 0;
	const addressedEntityInternalIds = new Set<string>();
	for (const entity of params.entities ?? []) {
		const internalEntityId = fullCustomer.entities?.find(
			(e) => e.id === entity.entity_id,
		)?.internal_id;
		if (internalEntityId) addressedEntityInternalIds.add(internalEntityId);
	}

	for (const planContext of flashContext.planContexts) {
		const existing = planContext.existingActiveCustomerProduct;
		if (existing) {
			flashed.push({
				plan_id: planContext.plan.plan_id,
				processor: planContext.processor ?? "stripe",
				customer_product_id: existing.id,
				status: existing.status,
				skipped: true,
				reason: "already_active",
			});
			continue;
		}

		const { customerProduct, reportStatus, mismatchReason } =
			buildCustomerProduct({
				ctx,
				flashContext,
				planContext,
			});
		insertCustomerProducts.push(customerProduct);

		flashed.push({
			plan_id: planContext.plan.plan_id,
			processor: planContext.processor ?? "stripe",
			customer_product_id: customerProduct.id,
			status: reportStatus,
			skipped: false,
			...(mismatchReason && { mismatch: true, reason: mismatchReason }),
		});
	}

	// Reconcile each addressed scope independently: expire active in-scope
	// products absent from that scope's desired set. Non-addressed scopes and
	// products in other scopes are never touched.
	for (const customerProduct of fullCustomer.customer_products) {
		if (!ACTIVE_STATUSES.includes(customerProduct.status)) continue;

		const entityInternalId = customerProduct.internal_entity_id;
		let isDesired: boolean;
		if (nullish(entityInternalId)) {
			if (!customerLevelAddressed) continue;
			isDesired = customerDesiredProductIds.has(
				customerProduct.internal_product_id,
			);
		} else {
			if (!addressedEntityInternalIds.has(entityInternalId)) continue;
			isDesired =
				entityDesiredProductIds
					.get(entityInternalId)
					?.has(customerProduct.internal_product_id) ?? false;
		}
		if (isDesired) continue;

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
