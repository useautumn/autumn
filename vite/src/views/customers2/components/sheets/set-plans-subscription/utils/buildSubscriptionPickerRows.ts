import type { Entity, FullCusProduct, SyncProposalV2 } from "@autumn/shared";
import type Stripe from "stripe";
import type { SetPlansSubscriptionTarget } from "@/components/forms/create-schedule/types/setPlansSubscriptionTarget";
import {
	type StripeStatus,
	stripeObjectToStatus,
	stripeSubscriptionToStatus,
} from "@/views/customers2/components/sync-stripe-v2/stripeStatus";
import { isLiveCustomerProduct } from "./collectLinkedStripeObjectIds";
import { formatStripeObjectId } from "./formatStripeObjectId";
import { stripeSubscriptionIntervalLabel } from "./stripeSubscriptionIntervalLabel";
import {
	type SubscriptionRenewal,
	stripeScheduleToRenewal,
	stripeSubscriptionToRenewal,
} from "./subscriptionRenewal";

export type SubscriptionPickerRow = {
	key: string;
	stripeSubscriptionId: string | null;
	stripeScheduleId: string | null;
	scopeName: string;
	stripeObjectLabel: string;
	planNames: string[];
	status: StripeStatus | null;
	renewal: SubscriptionRenewal;
};

const CUSTOMER_LEVEL_SCOPE_NAME = "Customer-level";
const NOT_STARTED_SCHEDULE_LABEL = "Not started";

const ENDED_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
	"canceled",
	"incomplete_expired",
]);

const uniqueValues = (values: string[]) => [...new Set(values)];

const isEndedSubscription = (subscription: Stripe.Subscription) =>
	ENDED_SUBSCRIPTION_STATUSES.has(subscription.status);

const isOnStripeObject = ({
	customerProduct,
	stripeSubscriptionId,
	stripeScheduleId,
}: {
	customerProduct: FullCusProduct;
	stripeSubscriptionId: string | null;
	stripeScheduleId: string | null;
}) =>
	Boolean(
		(stripeSubscriptionId &&
			customerProduct.subscription_ids?.includes(stripeSubscriptionId)) ||
			(stripeScheduleId &&
				customerProduct.scheduled_ids?.includes(stripeScheduleId)),
	);

const customerProductScopeName = ({
	customerProduct,
	entities,
}: {
	customerProduct: FullCusProduct;
	entities: Entity[];
}) => {
	if (!customerProduct.entity_id && !customerProduct.internal_entity_id) {
		return CUSTOMER_LEVEL_SCOPE_NAME;
	}
	const entity = entities.find(
		(candidate) =>
			candidate.id === customerProduct.entity_id ||
			candidate.internal_id === customerProduct.internal_entity_id,
	);
	return (
		entity?.name ??
		entity?.id ??
		customerProduct.entity_id ??
		CUSTOMER_LEVEL_SCOPE_NAME
	);
};

/** A live Stripe subscription Autumn bills on, or a not-yet-started schedule
 * holding Autumn's scheduled plans. */
const isPickableProposal = ({
	proposal,
	liveCustomerProducts,
}: {
	proposal: SyncProposalV2;
	liveCustomerProducts: FullCusProduct[];
}) => {
	const subscription = proposal.stripe_subscription;
	if (subscription) {
		if (isEndedSubscription(subscription)) return false;
		return liveCustomerProducts.some((customerProduct) =>
			customerProduct.subscription_ids?.includes(subscription.id),
		);
	}

	const schedule = proposal.stripe_schedule;
	if (!schedule || schedule.status !== "not_started") return false;
	return liveCustomerProducts.some((customerProduct) =>
		customerProduct.scheduled_ids?.includes(schedule.id),
	);
};

const proposalToRenewal = ({
	subscription,
	schedule,
}: {
	subscription: Stripe.Subscription | null;
	schedule: Stripe.SubscriptionSchedule | null;
}): SubscriptionRenewal => {
	if (subscription) return stripeSubscriptionToRenewal({ subscription });
	if (schedule) return stripeScheduleToRenewal({ schedule });
	return { kind: "none" };
};

const proposalToRow = ({
	proposal,
	liveCustomerProducts,
	entities,
}: {
	proposal: SyncProposalV2;
	liveCustomerProducts: FullCusProduct[];
	entities: Entity[];
}): SubscriptionPickerRow => {
	const subscription = proposal.stripe_subscription;
	const schedule = proposal.stripe_schedule;
	const stripeSubscriptionId = subscription?.id ?? null;
	const stripeScheduleId = schedule?.id ?? null;
	const linkedCustomerProducts = liveCustomerProducts.filter(
		(customerProduct) =>
			isOnStripeObject({
				customerProduct,
				stripeSubscriptionId,
				stripeScheduleId,
			}),
	);

	const objectId = stripeSubscriptionId ?? stripeScheduleId ?? "";
	const cadence = subscription
		? stripeSubscriptionIntervalLabel({ subscription })
		: NOT_STARTED_SCHEDULE_LABEL;

	return {
		key: objectId,
		stripeSubscriptionId,
		stripeScheduleId,
		scopeName: uniqueValues(
			linkedCustomerProducts.map((customerProduct) =>
				customerProductScopeName({ customerProduct, entities }),
			),
		).join(", "),
		stripeObjectLabel: [formatStripeObjectId(objectId), cadence]
			.filter(Boolean)
			.join(" · "),
		planNames: uniqueValues(
			linkedCustomerProducts.map(
				(customerProduct) =>
					customerProduct.product?.name ?? customerProduct.product_id,
			),
		),
		status: subscription
			? stripeSubscriptionToStatus({ subscription })
			: stripeObjectToStatus({ subscription: null, schedule }),
		renewal: proposalToRenewal({ subscription, schedule }),
	};
};

/** One row per Autumn-linked Stripe subscription or not-yet-started schedule;
 * ended subscriptions and Stripe objects Autumn doesn't bill on are left out. */
export const buildSubscriptionPickerRows = ({
	proposals,
	customerProducts,
	entities,
}: {
	proposals: SyncProposalV2[];
	customerProducts: FullCusProduct[];
	entities: Entity[];
}): SubscriptionPickerRow[] => {
	const liveCustomerProducts = customerProducts.filter(isLiveCustomerProduct);
	return proposals
		.filter((proposal) =>
			isPickableProposal({ proposal, liveCustomerProducts }),
		)
		.map((proposal) =>
			proposalToRow({ proposal, liveCustomerProducts, entities }),
		);
};

export const subscriptionPickerRowToTarget = ({
	row,
}: {
	row: SubscriptionPickerRow;
}): SetPlansSubscriptionTarget => ({
	key: row.key,
	stripeSubscriptionId: row.stripeSubscriptionId,
	stripeScheduleId: row.stripeScheduleId,
	label: row.stripeObjectLabel,
	canChange: true,
});
