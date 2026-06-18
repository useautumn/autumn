import {
	ErrCode,
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionId,
	isCustomerProductOnStripeSubscriptionSchedule,
	RecaseError,
	type SyncPhase,
	type SyncProposalsV2Params,
	type SyncProposalsV2Response,
	type SyncProposalV2,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { isStripeSubscriptionSchedulePhaseCurrent } from "@/external/stripe/subscriptionSchedules";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { subscriptionToSyncParams } from "./subscriptionToSyncParams";

const findAlreadyLinkedProductId = ({
	stripeSubscriptionId,
	stripeScheduleId,
	customerProducts,
}: {
	stripeSubscriptionId?: string;
	stripeScheduleId?: string;
	customerProducts: FullCusProduct[];
}): string | null => {
	const linkedBySubscription = stripeSubscriptionId
		? filterCustomerProductsByStripeSubscriptionId({
				customerProducts,
				stripeSubscriptionId,
			})[0]
		: undefined;
	const linked =
		linkedBySubscription ??
		customerProducts.find((customerProduct) =>
			isCustomerProductOnStripeSubscriptionSchedule({
				customerProduct,
				stripeSubscriptionScheduleId: stripeScheduleId,
			}),
		);
	return linked?.product?.id ?? null;
};

const buildScheduleProposalPhases = ({
	schedule,
	detectedPhases,
}: {
	schedule: Stripe.SubscriptionSchedule;
	detectedPhases: SyncPhase[];
}): SyncPhase[] => {
	const nowSeconds = Math.floor(Date.now() / 1000);

	return schedule.phases.map((schedulePhase) => {
		const isCurrent = isStripeSubscriptionSchedulePhaseCurrent({
			phase: schedulePhase,
			nowSeconds,
		});
		const startsAt = isCurrent ? "now" : secondsToMs(schedulePhase.start_date);
		const detectedPhase = detectedPhases.find(
			(phase) => phase.starts_at === startsAt,
		);

		return {
			starts_at: startsAt,
			plans: detectedPhase?.plans ?? [],
		};
	});
};

const buildProposalPhases = ({
	schedule,
	detectedPhases,
}: {
	schedule: Stripe.SubscriptionSchedule | null;
	detectedPhases: SyncPhase[];
}): SyncPhase[] => {
	if (schedule) {
		return buildScheduleProposalPhases({ schedule, detectedPhases });
	}

	if (detectedPhases.length > 0) return detectedPhases;
	return [{ starts_at: "now", plans: [] }];
};

const buildProposal = async ({
	ctx,
	customerId,
	subscription,
	schedule,
	customerProducts,
}: {
	ctx: AutumnContext;
	customerId: string;
	subscription?: Stripe.Subscription;
	schedule?: Stripe.SubscriptionSchedule;
	customerProducts: FullCusProduct[];
}): Promise<SyncProposalV2> => {
	const { params, schedule: resolvedSchedule } = await subscriptionToSyncParams(
		{
			ctx,
			customerId,
			subscription,
			schedule,
			customerProducts,
		},
	);

	const detectedPhases = params.phases ?? [];
	const phases = buildProposalPhases({
		schedule: resolvedSchedule,
		detectedPhases,
	});

	return {
		stripe_subscription_id: params.stripe_subscription_id,
		stripe_schedule_id: params.stripe_schedule_id,
		phases,
		stripe_subscription: subscription ?? null,
		stripe_schedule: resolvedSchedule,
		already_linked_product_id: findAlreadyLinkedProductId({
			stripeSubscriptionId: subscription?.id,
			stripeScheduleId: params.stripe_schedule_id,
			customerProducts,
		}),
	};
};

/**
 * V2 sync proposals — for each Stripe subscription, runs detection +
 * `subscriptionToSyncParams` to produce a draft `SyncParamsV1` and packages
 * it with display extras. Frontend can mutate `phases` and pass straight to
 * `/billing.sync`.
 */
export const syncProposalsV2 = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: SyncProposalsV2Params;
}): Promise<SyncProposalsV2Response> => {
	const { org, env } = ctx;

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: params.customer_id,
		withSubs: true,
	});

	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) {
		throw new RecaseError({
			message:
				"This customer has no linked Stripe customer ID. Set the customer's Stripe ID, then resync.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const stripeCli = createStripeCli({ org, env });
	const [subscriptionList, scheduleList] = await Promise.all([
		stripeCli.subscriptions.list({
			customer: stripeCustomerId,
			limit: 100,
		}),
		stripeCli.subscriptionSchedules.list({
			customer: stripeCustomerId,
			scheduled: true,
			limit: 100,
		}),
	]);

	if (subscriptionList.data.length === 0 && scheduleList.data.length === 0) {
		return { customer_id: params.customer_id, proposals: [] };
	}

	// Stripe caps `expand` at 4 levels, so retrieve each subscription with
	// `items.data.price.product` (4 levels) for the UI.
	const subscriptionProposals = await Promise.all(
		subscriptionList.data.map(async ({ id }) => {
			const subscription = await stripeCli.subscriptions.retrieve(id, {
				expand: ["items.data.price.product"],
			});
			return buildProposal({
				ctx,
				customerId: params.customer_id,
				subscription,
				customerProducts: fullCustomer.customer_products,
			});
		}),
	);

	const scheduleProposals = await Promise.all(
		scheduleList.data.map(async ({ id }) => {
			const schedule = await stripeCli.subscriptionSchedules.retrieve(id, {
				expand: ["phases.items.price.product"],
			});
			return buildProposal({
				ctx,
				customerId: params.customer_id,
				schedule,
				customerProducts: fullCustomer.customer_products,
			});
		}),
	);

	return {
		customer_id: params.customer_id,
		proposals: [...subscriptionProposals, ...scheduleProposals],
	};
};
