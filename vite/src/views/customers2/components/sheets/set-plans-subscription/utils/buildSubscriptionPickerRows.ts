import type { Entity, FullCusProduct, SyncProposalV2 } from "@autumn/shared";
import { customerProductsToMainPlanName } from "@autumn/shared";
import type Stripe from "stripe";
import type { SetPlansSubscriptionTarget } from "@/components/forms/create-schedule/types/setPlansSubscriptionTarget";
import {
	type StripeStatus,
	stripeObjectToStatus,
	stripeSubscriptionToStatus,
} from "@/views/customers2/components/sync-stripe-v2/stripeStatus";
import {
	collectLinkedStripeObjectIds,
	isLiveCustomerProduct,
} from "./collectLinkedStripeObjectIds";
import { formatStripeObjectId } from "./formatStripeObjectId";
import { stripeSubscriptionIntervalLabel } from "./stripeSubscriptionIntervalLabel";
import {
	type SubscriptionRenewal,
	stripeScheduleToRenewal,
	stripeSubscriptionToRenewal,
	subscriptionRenewalPhrase,
} from "./subscriptionRenewal";

export type SubscriptionPickerStripeDetails = {
	status: StripeStatus | null;
	renewal: SubscriptionRenewal;
	cadence: string | null;
};

export type SubscriptionPickerRow = {
	key: string;
	stripeSubscriptionId: string | null;
	stripeScheduleId: string | null;
	scopeName: string;
	stripeObjectId: string;
	mainPlanName: string | null;
	planNames: string[];
	/** Null until Stripe has loaded; the row is pickable before then. */
	stripe: SubscriptionPickerStripeDetails | null;
};

const CUSTOMER_LEVEL_SCOPE_NAME = "Customer-level";
const NOT_STARTED_SCHEDULE_LABEL = "Not started";

const ENDED_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
	"canceled",
	"incomplete_expired",
]);

const uniqueValues = (values: string[]) => [...new Set(values)];

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

const linkedRow = ({
	stripeSubscriptionId,
	stripeScheduleId,
	linkedCustomerProducts,
	entities,
}: {
	stripeSubscriptionId: string | null;
	stripeScheduleId: string | null;
	linkedCustomerProducts: FullCusProduct[];
	entities: Entity[];
}): SubscriptionPickerRow => {
	const objectId = stripeSubscriptionId ?? stripeScheduleId ?? "";
	return {
		key: objectId,
		stripeSubscriptionId,
		stripeScheduleId,
		scopeName: uniqueValues(
			linkedCustomerProducts.map((customerProduct) =>
				customerProductScopeName({ customerProduct, entities }),
			),
		).join(", "),
		stripeObjectId: formatStripeObjectId(objectId),
		mainPlanName: customerProductsToMainPlanName({
			customerProducts: linkedCustomerProducts,
		}),
		planNames: uniqueValues(
			linkedCustomerProducts.map(
				(customerProduct) =>
					customerProduct.product?.name ?? customerProduct.product_id,
			),
		),
		stripe: null,
	};
};

/** Rows straight from the customer's plans, so the picker renders before Stripe answers. */
const customerProductsToRows = ({
	customerProducts,
	entities,
}: {
	customerProducts: FullCusProduct[];
	entities: Entity[];
}): SubscriptionPickerRow[] => {
	const liveCustomerProducts = customerProducts.filter(isLiveCustomerProduct);
	const { subscriptionIds, standaloneScheduleIds } =
		collectLinkedStripeObjectIds({ customerProducts });

	const subscriptionRows = subscriptionIds.map((stripeSubscriptionId) => {
		const linkedCustomerProducts = liveCustomerProducts.filter(
			(customerProduct) =>
				customerProduct.subscription_ids?.includes(stripeSubscriptionId),
		);
		return linkedRow({
			stripeSubscriptionId,
			stripeScheduleId:
				linkedCustomerProducts.flatMap(
					(customerProduct) => customerProduct.scheduled_ids ?? [],
				)[0] ?? null,
			linkedCustomerProducts,
			entities,
		});
	});
	const scheduleRows = standaloneScheduleIds.map((stripeScheduleId) =>
		linkedRow({
			stripeSubscriptionId: null,
			stripeScheduleId,
			linkedCustomerProducts: liveCustomerProducts.filter((customerProduct) =>
				customerProduct.scheduled_ids?.includes(stripeScheduleId),
			),
			entities,
		}),
	);
	return [...subscriptionRows, ...scheduleRows];
};

const findRowProposal = ({
	row,
	proposals,
}: {
	row: SubscriptionPickerRow;
	proposals: SyncProposalV2[];
}) =>
	proposals.find((proposal) =>
		row.stripeSubscriptionId
			? proposal.stripe_subscription?.id === row.stripeSubscriptionId
			: !proposal.stripe_subscription &&
				proposal.stripe_schedule?.id === row.stripeScheduleId,
	);

const isEndedInStripe = (proposal: SyncProposalV2) => {
	const subscription = proposal.stripe_subscription;
	if (subscription) return ENDED_SUBSCRIPTION_STATUSES.has(subscription.status);
	return proposal.stripe_schedule?.status !== "not_started";
};

const proposalToStripeDetails = (
	proposal: SyncProposalV2,
): SubscriptionPickerStripeDetails => {
	const subscription = proposal.stripe_subscription;
	const schedule = proposal.stripe_schedule;
	if (subscription) {
		return {
			status: stripeSubscriptionToStatus({ subscription }),
			renewal: stripeSubscriptionToRenewal({ subscription }),
			cadence: stripeSubscriptionIntervalLabel({ subscription }),
		};
	}
	return {
		status: stripeObjectToStatus({ subscription: null, schedule }),
		renewal: schedule
			? stripeScheduleToRenewal({ schedule })
			: { kind: "none" },
		cadence: NOT_STARTED_SCHEDULE_LABEL,
	};
};

/** Stripe's view of each row once loaded; rows Stripe has ended drop out. */
const withStripeDetails = ({
	rows,
	proposals,
}: {
	rows: SubscriptionPickerRow[];
	proposals: SyncProposalV2[];
}): SubscriptionPickerRow[] =>
	rows.flatMap((row) => {
		const proposal = findRowProposal({ row, proposals });
		if (!proposal) return [row];
		if (isEndedInStripe(proposal)) return [];
		return [
			{
				...row,
				stripeScheduleId: proposal.stripe_schedule?.id ?? row.stripeScheduleId,
				stripe: proposalToStripeDetails(proposal),
			},
		];
	});

/** One row per Autumn-linked Stripe subscription or not-yet-started schedule,
 * enriched with Stripe's status once `proposals` have loaded. */
export const buildSubscriptionPickerRows = ({
	proposals,
	customerProducts,
	entities,
}: {
	proposals: SyncProposalV2[] | undefined;
	customerProducts: FullCusProduct[];
	entities: Entity[];
}): SubscriptionPickerRow[] => {
	const rows = customerProductsToRows({ customerProducts, entities });
	return proposals ? withStripeDetails({ rows, proposals }) : rows;
};

/** "Monthly · renews Nov 1, 2026", once Stripe has loaded. */
export const subscriptionPickerRowDetails = ({
	row,
}: {
	row: SubscriptionPickerRow;
}): string | null => {
	if (!row.stripe) return null;
	const details = [
		row.stripe.cadence,
		subscriptionRenewalPhrase({ renewal: row.stripe.renewal }),
	].filter(Boolean);
	return details.length > 0 ? details.join(" · ") : null;
};

export const subscriptionPickerRowToTarget = ({
	row,
}: {
	row: SubscriptionPickerRow;
}): SetPlansSubscriptionTarget => ({
	key: row.key,
	stripeSubscriptionId: row.stripeSubscriptionId,
	stripeScheduleId: row.stripeScheduleId,
	planName: row.mainPlanName,
	stripeObjectId: row.stripeObjectId,
	details: subscriptionPickerRowDetails({ row }),
	canChange: true,
});
