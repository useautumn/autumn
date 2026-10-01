import {
	type AutumnBillingPlan,
	type CreateScheduleBillingContext,
	CusProductStatus,
	type FullCusProduct,
	isCustomerProductOnStripeSubscription,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyScheduleTimingToCustomerProductPlan } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import type {
	TimelineDiff,
	TimelineOperation,
} from "../../timeline/types/timelineDiff";
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
	deleteCustomerProducts: FullCusProduct[];
	outgoingCustomerProducts: FullCusProduct[];
	keptCustomerProducts: FullCusProduct[];
	/** The row each resolved segment runs on once the plan executes. */
	customerProductIdBySegmentId: Map<string, string>;
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

const isLiveRow = (customerProduct: FullCusProduct) =>
	customerProduct.status !== CusProductStatus.Scheduled;

/** A kept row takes its new end, and moves off a replaced subscription onto the new one. */
const keptRowUpdate = ({
	billingContext,
	customerProduct,
	retime,
}: {
	billingContext: CreateScheduleBillingContext;
	customerProduct: FullCusProduct;
	retime?: OperationOf<"retime">;
}): { update?: CustomerProductUpdate; patch?: CustomerProductPatch } => {
	const update: CustomerProductUpdate = { customerProduct, updates: {} };
	if (retime && isLiveRow(customerProduct)) {
		applyScheduleTimingToCustomerProductPlan({
			result: { updateCustomerProduct: update },
			endedAt: retime.endsAt,
		});
	} else if (retime) {
		update.updates.ended_at = retime.endsAt;
	}

	const relinks =
		isLiveRow(customerProduct) &&
		isOnReplacedSubscription({ billingContext, customerProduct });
	// Unlinked and paired with an empty patch, execution stamps the new subscription's id on it.
	if (relinks) update.updates.subscription_ids = [];

	return {
		update: Object.keys(update.updates).length > 0 ? update : undefined,
		patch: relinks ? emptyPatch(customerProduct) : undefined,
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

	for (const keep of operations.keep) {
		const customerProduct = customerProductFor(keep.customerProductId);
		if (!customerProductIdBySegmentId.has(keep.segmentId)) {
			customerProductIdBySegmentId.set(keep.segmentId, customerProduct.id);
		}
		if (isLiveRow(customerProduct)) keptCustomerProducts.push(customerProduct);

		const { update, patch } = keptRowUpdate({
			billingContext,
			customerProduct,
			retime: retimes.find(
				({ customerProductId }) => customerProductId === customerProduct.id,
			),
		});
		if (update) updateCustomerProducts.push(update);
		if (patch) patchCustomerProducts.push(patch);
	}

	const segmentsById = new Map(
		diff.timeline.map((segment) => [segment.id, segment]),
	);
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
		deleteCustomerProducts: operations.delete.map(({ customerProductId }) =>
			customerProductFor(customerProductId),
		),
		outgoingCustomerProducts,
		keptCustomerProducts,
		customerProductIdBySegmentId,
	};
};
