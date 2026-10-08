import {
	type AutumnBillingPlan,
	type CreateScheduleBillingContext,
	CusProductStatus,
	type FullCusProduct,
	isCustomerProductOnStripeSubscriptionSchedule,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyScheduleTimingToCustomerProductPlan } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { applyTrialContextToPatchedCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initPatchedCustomerProduct/applyTrialContextToPatchedCustomerProduct";
import { startsInFuture } from "../../timeline/timelineGuards";
import type {
	ResolvedSegment,
	TimelineDiff,
	TimelineOperation,
} from "../../timeline/types/timelineDiff";
import { isBackdateRecreate } from "../../utils/isBackdateRecreate";
import { isOnReplacedStripeSubscription } from "../../utils/isOnReplacedStripeSubscription";
import { isTrialBackdateRecreate } from "../../utils/isTrialBackdateRecreate";
import { replacedStripeScheduleId } from "../../utils/replacedStripeScheduleId";
import { insertSegmentCustomerProduct } from "./insertSegmentCustomerProduct";

type CustomerProductUpdate = NonNullable<
	AutumnBillingPlan["updateCustomerProducts"]
>[number];
type CustomerProductPatch = NonNullable<
	AutumnBillingPlan["patchCustomerProducts"]
>[number];

export type SetPlansCustomerProductChanges = {
	immediateInsertCustomerProducts: FullCusProduct[];
	scheduledInsertCustomerProducts: FullCusProduct[];
	updateCustomerProducts: CustomerProductUpdate[];
	patchCustomerProducts: CustomerProductPatch[];
	/** Kept rows a requested trial starts on, as they were and as they run on. */
	trialStartedCustomerProducts: TrialStartedCustomerProduct[];
	deleteCustomerProducts: FullCusProduct[];
	outgoingCustomerProducts: FullCusProduct[];
	keptCustomerProducts: FullCusProduct[];
	/** The row each resolved segment runs on once the plan executes. */
	customerProductIdBySegmentId: Map<string, string>;
};

export type TrialStartedCustomerProduct = {
	customerProduct: FullCusProduct;
	trialingCustomerProduct: FullCusProduct;
};

type OperationOf<Type extends TimelineOperation["type"]> = Extract<
	TimelineOperation,
	{ type: Type }
>;

type OperationsByType = {
	[Type in TimelineOperation["type"]]: OperationOf<Type>[];
};

const groupOperations = (operations: TimelineOperation[]): OperationsByType => {
	const grouped: OperationsByType = {
		keep: [],
		retime: [],
		expire: [],
		delete: [],
		insert: [],
	};
	for (const operation of operations) {
		switch (operation.type) {
			case "keep":
				grouped.keep.push(operation);
				break;
			case "retime":
				grouped.retime.push(operation);
				break;
			case "expire":
				grouped.expire.push(operation);
				break;
			case "delete":
				grouped.delete.push(operation);
				break;
			case "insert":
				grouped.insert.push(operation);
				break;
			default: {
				const unreachable: never = operation;
				throw new Error(`Unknown timeline operation ${unreachable}`);
			}
		}
	}
	return grouped;
};

const expireUpdate = ({
	customerProduct,
	now,
}: {
	customerProduct: FullCusProduct;
	now: number;
}): CustomerProductUpdate => ({
	customerProduct,
	updates: {
		status: CusProductStatus.Expired,
		ended_at: now,
		canceled: true,
		canceled_at: now,
		scheduled_ids: [],
	},
});

const emptyPatch = (customerProduct: FullCusProduct): CustomerProductPatch => ({
	customerProduct,
	insertCustomerEntitlements: [],
	insertCustomerPrices: [],
	deleteCustomerEntitlements: [],
	deleteCustomerPrices: [],
});

const isOnReplacedSchedule = ({
	billingContext,
	customerProduct,
}: {
	billingContext: CreateScheduleBillingContext;
	customerProduct: FullCusProduct;
}) => {
	const replacedScheduleId = replacedStripeScheduleId({
		replacedStripeSubscription: billingContext.replacedStripeSubscription,
	});
	return (
		replacedScheduleId !== undefined &&
		isCustomerProductOnStripeSubscriptionSchedule({
			customerProduct,
			stripeSubscriptionScheduleId: replacedScheduleId,
		}) === true
	);
};

const isLiveRow = (customerProduct: FullCusProduct) =>
	customerProduct.status !== CusProductStatus.Scheduled;

/** A live row the request declares now starts its explicit trial in place, keeping its balances. */
const keptRowTrialStart = ({
	billingContext,
	customerProduct,
	segment,
	now,
}: {
	billingContext: CreateScheduleBillingContext;
	customerProduct: FullCusProduct;
	segment?: ResolvedSegment;
	now: number;
}) => {
	const isDeclaredNow =
		segment?.origin === "declared" && !startsInFuture({ segment, now });
	const startsTrial =
		Boolean(billingContext.trialContext?.customFreeTrial) &&
		isLiveRow(customerProduct) &&
		isDeclaredNow;
	if (!startsTrial) return undefined;

	const trialingCustomerProduct = { ...customerProduct };
	const updates = applyTrialContextToPatchedCustomerProduct({
		customerProduct: trialingCustomerProduct,
		trialContext: billingContext.trialContext,
	});
	return {
		updates,
		trialStarted: { customerProduct, trialingCustomerProduct },
	};
};

/** The links a kept row drops to leave a replaced subscription; a backdate recreate also moves its scheduled rows and schedule. */
const replacedLinkResets = ({
	billingContext,
	customerProduct,
}: {
	billingContext: CreateScheduleBillingContext;
	customerProduct: FullCusProduct;
}): CustomerProductUpdate["updates"] | undefined => {
	const onReplacedSubscription = isOnReplacedStripeSubscription({
		billingContext,
		customerProduct,
	});
	if (!isBackdateRecreate({ billingContext })) {
		return isLiveRow(customerProduct) && onReplacedSubscription
			? { subscription_ids: [] }
			: undefined;
	}

	const onReplacedSchedule = isOnReplacedSchedule({
		billingContext,
		customerProduct,
	});
	if (!onReplacedSubscription && !onReplacedSchedule) return undefined;
	return {
		subscription_ids: [],
		...(onReplacedSchedule && { scheduled_ids: [] }),
	};
};

/** A kept row takes its new end and trial, and moves off a replaced subscription onto the new one, from its backdated start if any. */
const keptRowUpdate = ({
	billingContext,
	customerProduct,
	segment,
	now,
	retime,
	backdatedStartsAt,
}: {
	billingContext: CreateScheduleBillingContext;
	customerProduct: FullCusProduct;
	segment?: ResolvedSegment;
	now: number;
	retime?: OperationOf<"retime">;
	backdatedStartsAt?: number;
}): {
	update?: CustomerProductUpdate;
	patch?: CustomerProductPatch;
	trialStarted?: TrialStartedCustomerProduct;
} => {
	const trialStart = keptRowTrialStart({
		billingContext,
		customerProduct,
		segment,
		now,
	});
	const update: CustomerProductUpdate = {
		customerProduct,
		updates: { ...trialStart?.updates },
	};
	if (retime && isLiveRow(customerProduct)) {
		applyScheduleTimingToCustomerProductPlan({
			result: { updateCustomerProduct: update },
			endedAt: retime.endsAt,
		});
	} else if (retime) {
		update.updates.ended_at = retime.endsAt;
	}

	const linkResets = replacedLinkResets({ billingContext, customerProduct });
	// Unlinked and paired with an empty patch, execution stamps the new subscription and schedule ids on it.
	if (linkResets) Object.assign(update.updates, linkResets);
	// A row leaving a trialing subscription the request ends lands on a new one without a trial.
	if (linkResets && billingContext.trialContext?.trialEndsAt === null) {
		Object.assign(
			update.updates,
			applyTrialContextToPatchedCustomerProduct({
				customerProduct: { ...customerProduct },
				trialContext: billingContext.trialContext,
			}),
		);
	}
	if (
		linkResets &&
		isLiveRow(customerProduct) &&
		backdatedStartsAt !== undefined
	) {
		update.updates.starts_at = backdatedStartsAt;
	}

	return {
		update: Object.keys(update.updates).length > 0 ? update : undefined,
		patch: linkResets ? emptyPatch(customerProduct) : undefined,
		trialStarted: trialStart?.trialStarted,
	};
};

/** Projects the diff's row writes onto the customer's rows and the plans it inserts. */
export const diffToCustomerProducts = ({
	ctx,
	billingContext,
	diff,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	diff: TimelineDiff;
}): SetPlansCustomerProductChanges => {
	const customerProductsById = new Map(
		billingContext.fullCustomer.customer_products.map((customerProduct) => [
			customerProduct.id,
			customerProduct,
		]),
	);
	const customerProductFor = (customerProductId: string) => {
		const customerProduct = customerProductsById.get(customerProductId);
		if (!customerProduct) {
			throw new Error(`set_plans diff names unknown row ${customerProductId}`);
		}
		return customerProduct;
	};
	const customerProductIdBySegmentId = new Map<string, string>();
	const operations = groupOperations(diff.operations);
	const segmentsById = new Map(
		diff.timeline.map((segment) => [segment.id, segment]),
	);

	const expired = operations.expire;
	const outgoingCustomerProducts = expired.map(({ customerProductId }) =>
		customerProductFor(customerProductId),
	);

	const retimes = operations.retime;
	const updateCustomerProducts: CustomerProductUpdate[] =
		outgoingCustomerProducts.map((customerProduct) =>
			expireUpdate({ customerProduct, now: diff.now }),
		);
	const patchCustomerProducts: CustomerProductPatch[] = [];
	const keptCustomerProducts: FullCusProduct[] = [];
	const trialStartedCustomerProducts: TrialStartedCustomerProduct[] = [];

	const recreatesFromBackdate =
		isBackdateRecreate({ billingContext }) ||
		isTrialBackdateRecreate({ billingContext });
	const backdatedStartsAtFor = (segmentId: string) => {
		if (!recreatesFromBackdate) return undefined;
		const declared = segmentsById.get(segmentId)?.origin === "declared";
		return declared ? billingContext.subscriptionBackdateStartMs : undefined;
	};

	for (const keep of operations.keep) {
		const customerProduct = customerProductFor(keep.customerProductId);
		if (!customerProductIdBySegmentId.has(keep.segmentId)) {
			customerProductIdBySegmentId.set(keep.segmentId, customerProduct.id);
		}
		if (isLiveRow(customerProduct)) keptCustomerProducts.push(customerProduct);

		const { update, patch, trialStarted } = keptRowUpdate({
			billingContext,
			customerProduct,
			segment: segmentsById.get(keep.segmentId),
			now: diff.now,
			retime: retimes.find(
				({ customerProductId }) => customerProductId === customerProduct.id,
			),
			backdatedStartsAt: backdatedStartsAtFor(keep.segmentId),
		});
		if (update) updateCustomerProducts.push(update);
		if (patch) patchCustomerProducts.push(patch);
		if (trialStarted) trialStartedCustomerProducts.push(trialStarted);
	}

	const immediateInsertCustomerProducts: FullCusProduct[] = [];
	const scheduledInsertCustomerProducts: FullCusProduct[] = [];
	for (const insert of operations.insert) {
		const segment = segmentsById.get(insert.segmentId);
		if (!segment) throw new Error(`set_plans diff names ${insert.segmentId}`);

		const replacedOperation = expired.find(({ key }) => key === insert.key);
		const customerProduct = insertSegmentCustomerProduct({
			ctx,
			billingContext,
			segment,
			replacedCustomerProduct: replacedOperation
				? customerProductFor(replacedOperation.customerProductId)
				: undefined,
		});
		customerProductIdBySegmentId.set(segment.id, customerProduct.id);
		if (insert.startsNow) immediateInsertCustomerProducts.push(customerProduct);
		else scheduledInsertCustomerProducts.push(customerProduct);
	}

	return {
		immediateInsertCustomerProducts,
		scheduledInsertCustomerProducts,
		updateCustomerProducts,
		patchCustomerProducts,
		trialStartedCustomerProducts,
		deleteCustomerProducts: operations.delete.map(({ customerProductId }) =>
			customerProductFor(customerProductId),
		),
		outgoingCustomerProducts,
		keptCustomerProducts,
		customerProductIdBySegmentId,
	};
};
