import type {
	AutumnBillingPlan,
	CreateScheduleBillingContext,
	FullCusProduct,
	MultiAttachProductContext,
} from "@autumn/shared";
import {
	CusProductStatus,
	isCusProductOnEntity,
	isCustomerProductOnStripeSubscription,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachNewCustomerProduct } from "@/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct";
import { productContextToAttachBillingContext } from "@/internal/billing/v2/utils/billingContext/productContextToAttachBillingContext";
import { applyScheduleTimingToCustomerProductPlan } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import {
	type KeptCustomerProduct,
	partitionUnchangedCustomerProducts,
} from "./partitionUnchangedCustomerProducts";

type CustomerProductUpdate = NonNullable<
	AutumnBillingPlan["updateCustomerProducts"]
>[number];
type CustomerProductPatch = NonNullable<
	AutumnBillingPlan["patchCustomerProducts"]
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

const resolveImmediateEndedAt = ({
	unscheduled,
	nextPhaseStartsAt,
	endsAt,
}: {
	unscheduled: boolean;
	nextPhaseStartsAt: number | undefined;
	endsAt: number | undefined;
}): number | null => {
	if (unscheduled) return endsAt ?? null;
	return nextPhaseStartsAt ?? endsAt ?? null;
};

const isOnReplacedSubscription = ({
	billingContext,
	customerProduct,
}: {
	billingContext: CreateScheduleBillingContext;
	customerProduct: FullCusProduct;
}) => {
	const replacedSubscriptionId = billingContext.replacedStripeSubscription?.id;
	return (
		replacedSubscriptionId !== undefined &&
		isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId: replacedSubscriptionId,
		}) === true
	);
};

const emptyPatch = (customerProduct: FullCusProduct): CustomerProductPatch => ({
	customerProduct,
	insertCustomerEntitlements: [],
	insertCustomerPrices: [],
	deleteCustomerEntitlements: [],
	deleteCustomerPrices: [],
});

/** Kept plans only take the phase's end date, and move off a replaced subscription. */
const updateKeptCustomerProducts = ({
	billingContext,
	keptCustomerProducts,
	nextPhaseStartsAt,
}: {
	billingContext: CreateScheduleBillingContext;
	keptCustomerProducts: KeptCustomerProduct[];
	nextPhaseStartsAt: number | undefined;
}) => {
	const updateCustomerProducts: CustomerProductUpdate[] = [];
	const patchCustomerProducts: CustomerProductPatch[] = [];

	for (const { customerProduct, productContext } of keptCustomerProducts) {
		const update: CustomerProductUpdate = { customerProduct, updates: {} };
		const endedAt = resolveImmediateEndedAt({
			unscheduled: productContext.unscheduled === true,
			nextPhaseStartsAt,
			endsAt: billingContext.endsAt,
		});
		if ((customerProduct.ended_at ?? null) !== endedAt) {
			applyScheduleTimingToCustomerProductPlan({
				result: { updateCustomerProduct: update },
				endedAt,
			});
		}

		// Unlinked and paired with an empty patch, execution stamps the new subscription's id on it.
		if (isOnReplacedSubscription({ billingContext, customerProduct })) {
			update.updates.subscription_ids = [];
			patchCustomerProducts.push(emptyPatch(customerProduct));
		}

		if (Object.keys(update.updates).length > 0) {
			updateCustomerProducts.push(update);
		}
	}

	return { updateCustomerProducts, patchCustomerProducts };
};

const insertImmediateCustomerProducts = ({
	ctx,
	billingContext,
	productContexts,
	expiredCustomerProducts,
	nextPhaseStartsAt,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	productContexts: MultiAttachProductContext[];
	expiredCustomerProducts: FullCusProduct[];
	nextPhaseStartsAt: number | undefined;
}) =>
	productContexts.map((productContext) => {
		const expiredSameProduct = expiredCustomerProducts.find(
			(customerProduct) =>
				customerProduct.product.id === productContext.fullProduct.id &&
				isCusProductOnEntity({
					cusProduct: customerProduct,
					internalEntityId: productContext.fullCustomer.entity?.internal_id,
				}),
		);

		const attachBillingContext = productContextToAttachBillingContext({
			billingContext,
			productContext,
			currentCustomerProductOverride: expiredSameProduct,
		});

		const newCustomerProduct = computeAttachNewCustomerProduct({
			ctx,
			attachBillingContext,
			params: { no_billing_changes: billingContext.skipBillingChanges },
		});

		if (expiredSameProduct) {
			newCustomerProduct.starts_at = expiredSameProduct.starts_at;
		}

		applyScheduleTimingToCustomerProductPlan({
			result: { insertCustomerProduct: newCustomerProduct },
			endedAt: resolveImmediateEndedAt({
				unscheduled: productContext.unscheduled === true,
				nextPhaseStartsAt,
				endsAt: billingContext.endsAt,
			}),
		});
		if (billingContext.skipBillingChanges) {
			newCustomerProduct.scheduled_ids =
				attachBillingContext.currentCustomerProduct?.scheduled_ids;
		}

		return {
			customerProduct: newCustomerProduct,
			unscheduled: productContext.unscheduled === true,
		};
	});

/** Compute the immediate phase: plans already running as requested stay, the rest are expired and inserted afresh. */
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
	const {
		keptCustomerProducts,
		changedCustomerProducts,
		changedProductContexts,
	} = partitionUnchangedCustomerProducts({
		ctx,
		billingContext,
		currentRecurringCustomerProducts,
	});

	const kept = updateKeptCustomerProducts({
		billingContext,
		keptCustomerProducts,
		nextPhaseStartsAt,
	});

	const expired = expireCurrentRecurringCustomerProducts({
		customerProducts: changedCustomerProducts,
		currentEpochMs: billingContext.currentEpochMs,
	});

	const inserted = insertImmediateCustomerProducts({
		ctx,
		billingContext,
		productContexts: changedProductContexts,
		expiredCustomerProducts: changedCustomerProducts,
		nextPhaseStartsAt,
	});

	const scheduledKeptIds = keptCustomerProducts
		.filter(({ productContext }) => !productContext.unscheduled)
		.map(({ customerProduct }) => customerProduct.id);

	return {
		keptCustomerProducts: keptCustomerProducts.map(
			({ customerProduct }) => customerProduct,
		),
		outgoingCustomerProducts: changedCustomerProducts,
		// Unscheduled plans still bill now, so they belong to the inserts...
		insertCustomerProducts: inserted.map(
			({ customerProduct }) => customerProduct,
		),
		updateCustomerProducts: [...expired, ...kept.updateCustomerProducts],
		patchCustomerProducts: kept.patchCustomerProducts,
		// ...but not to the phase: the schedule must never expire them.
		phaseCustomerProductIds: [
			...scheduledKeptIds,
			...inserted
				.filter(({ unscheduled }) => !unscheduled)
				.map(({ customerProduct }) => customerProduct.id),
		],
	};
};
