import {
	CusProductStatus,
	type FullCusProduct,
	type FullProduct,
	filterCustomerProductsByStripeSubscriptionId,
	type SyncParamsV1,
	type SyncPhase,
	type SyncPlanInstance,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripeActiveSubscriptionSchedule } from "@/external/stripe/subscriptionSchedules";
import { stripeSubscriptionToScheduleId } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchStripeSyncSubscription } from "@/internal/billing/v2/providers/stripe/utils/sync/fetchStripeSyncObjects";
import { STRIPE_SYNC_SCHEDULE_EXPAND } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/stripeSyncExpand";
import { CusService } from "@/internal/customers/CusService";
import { buildFeatureQuantities } from "./buildSyncParams/buildFeatureQuantities";
import { detectSubscriptionMatch } from "./detect/detectSubscriptionMatch";
import type {
	ItemDiff,
	MatchedPlan,
	PhaseMatch,
	SubscriptionMatch,
} from "./detect/types";
import { stampEntityFromExistingLinks } from "./scope/stampEntityFromExistingLinks";

const CURRENT_LINKED_STATUSES = new Set<CusProductStatus>([
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Trialing,
]);

const scheduleToSubscriptionId = ({
	schedule,
}: {
	schedule?: Stripe.SubscriptionSchedule;
}): string | undefined =>
	typeof schedule?.subscription === "string"
		? schedule.subscription
		: schedule?.subscription?.id;

const currentLinkedInternalProductIds = ({
	customerProducts,
	stripeSubscriptionId,
}: {
	customerProducts: FullCusProduct[];
	stripeSubscriptionId?: string;
}): Set<string> | undefined => {
	if (!stripeSubscriptionId) return undefined;
	return new Set(
		filterCustomerProductsByStripeSubscriptionId({
			customerProducts,
			stripeSubscriptionId,
		})
			.filter((customerProduct) =>
				CURRENT_LINKED_STATUSES.has(customerProduct.status),
			)
			.map((customerProduct) => customerProduct.internal_product_id),
	);
};

const matchedPlanToSyncPlan = ({
	matchedPlan,
	itemDiffs,
}: {
	matchedPlan: MatchedPlan;
	itemDiffs: ItemDiff[];
}): SyncPlanInstance => {
	const featureQuantities = buildFeatureQuantities({ matchedPlan, itemDiffs });
	const upsertLicenses = matchedPlan.licenses?.flatMap(
		({ license_plan_id, customize }) =>
			customize ? [{ license_plan_id, customize }] : [],
	);
	const customize = upsertLicenses?.length
		? { ...matchedPlan.customize, upsert_licenses: upsertLicenses }
		: matchedPlan.customize;
	return {
		plan_id: matchedPlan.product.id,
		version: matchedPlan.product.version,
		quantity: matchedPlan.quantity,
		customize,
		expire_previous: true,
		feature_quantities:
			featureQuantities.length > 0 ? featureQuantities : undefined,
		license_quantities: matchedPlan.licenses?.map(
			({ license_plan_id, quantity }) => ({ license_plan_id, quantity }),
		),
	};
};

const phaseMatchToSyncPhase = ({
	phaseMatch,
}: {
	phaseMatch: PhaseMatch;
}): SyncPhase => ({
	starts_at: phaseMatch.is_current ? "now" : secondsToMs(phaseMatch.start_date),
	plans: phaseMatch.plans.map((matchedPlan) =>
		matchedPlanToSyncPlan({
			matchedPlan,
			itemDiffs: phaseMatch.item_diffs,
		}),
	),
});

export const subscriptionToSyncParams = async ({
	ctx,
	customerId,
	subscription,
	schedule,
	customerProducts,
	fullProducts,
}: {
	ctx: AutumnContext;
	customerId: string;
	subscription?: Stripe.Subscription;
	schedule?: Stripe.SubscriptionSchedule;
	customerProducts?: FullCusProduct[];
	fullProducts?: FullProduct[];
}): Promise<{
	match: SubscriptionMatch;
	params: SyncParamsV1;
	schedule: Stripe.SubscriptionSchedule | null;
}> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const resolvedSubscription =
		(await fetchStripeSyncSubscription({
			stripeCli,
			subscriptionId: subscription?.id,
		})) ?? undefined;
	const needsCustomer = customerProducts === undefined || !resolvedSubscription;
	const fullCustomer = needsCustomer
		? await CusService.getFull({ ctx, idOrInternalId: customerId })
		: undefined;
	const resolvedCustomerProducts =
		customerProducts ?? fullCustomer?.customer_products ?? [];

	let resolvedSchedule = schedule;
	if (!resolvedSchedule) {
		const scheduleId = stripeSubscriptionToScheduleId({
			stripeSubscription: resolvedSubscription,
		});
		if (scheduleId) {
			resolvedSchedule = await getStripeActiveSubscriptionSchedule({
				stripeClient: stripeCli,
				subscriptionScheduleId: scheduleId,
				expand: STRIPE_SYNC_SCHEDULE_EXPAND,
			});
		}
	}

	const linkedInternalProductIds = currentLinkedInternalProductIds({
		customerProducts: resolvedCustomerProducts,
		stripeSubscriptionId:
			resolvedSubscription?.id ??
			scheduleToSubscriptionId({ schedule: resolvedSchedule }),
	});

	const match = await detectSubscriptionMatch({
		ctx,
		subscription: resolvedSubscription,
		schedule: resolvedSchedule,
		billingCurrency: fullCustomer?.currency,
		fullProducts,
		linkedInternalProductIds,
	});

	const detectedPhases: SyncPhase[] = match.phaseMatches
		.filter((phase) => phase.plans.length > 0)
		.map((phaseMatch) => phaseMatchToSyncPhase({ phaseMatch }));

	const phases = stampEntityFromExistingLinks({
		phases: detectedPhases,
		subscription: resolvedSubscription,
		customerProducts: resolvedCustomerProducts,
	});

	const params: SyncParamsV1 = {
		customer_id: customerId,
		stripe_subscription_id: resolvedSubscription?.id,
		stripe_schedule_id: match.stripe_schedule_id ?? undefined,
		phases,
	};

	return { match, params, schedule: resolvedSchedule ?? null };
};
