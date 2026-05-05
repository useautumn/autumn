import {
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	RecaseError,
	type SyncBillingContext,
	type SyncParamsV1,
	type SyncPhaseContext,
	type SyncPlanInstance,
	type SyncProductContext,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupAttachProductContext } from "@/internal/billing/v2/actions/attach/setup/setupAttachProductContext";
import { setupAttachTransitionContext } from "@/internal/billing/v2/actions/attach/setup/setupAttachTransitionContext";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";

const fetchStripeSubscription = async ({
	ctx,
	stripeSubscriptionId,
}: {
	ctx: AutumnContext;
	stripeSubscriptionId?: string;
}): Promise<Stripe.Subscription | null> => {
	if (!stripeSubscriptionId) return null;
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	return stripeCli.subscriptions.retrieve(stripeSubscriptionId);
};

const fetchStripeSchedule = async ({
	ctx,
	stripeScheduleId,
}: {
	ctx: AutumnContext;
	stripeScheduleId?: string;
}): Promise<Stripe.SubscriptionSchedule | null> => {
	if (!stripeScheduleId) return null;
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	return stripeCli.subscriptionSchedules.retrieve(stripeScheduleId);
};

const buildProductContext = async ({
	ctx,
	fullCustomer,
	plan,
	isImmediate,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	plan: SyncPlanInstance;
	isImmediate: boolean;
}): Promise<SyncProductContext> => {
	const {
		fullProduct,
		customPrices = [],
		customEnts: customEntitlements = [],
	} = await setupAttachProductContext({ ctx, params: plan });

	const featureQuantities = setupFeatureQuantitiesContext({
		ctx,
		featureQuantitiesParams: { feature_quantities: plan.feature_quantities },
		fullProduct,
		initializeUndefinedQuantities: true,
	});

	let currentCustomerProduct: FullCusProduct | undefined;
	if (isImmediate && plan.expire_previous) {
		const transition = setupAttachTransitionContext({
			fullCustomer,
			attachProduct: fullProduct,
		});
		currentCustomerProduct = transition.currentCustomerProduct;
	}

	return {
		plan,
		fullProduct,
		customPrices,
		customEntitlements,
		featureQuantities,
		currentCustomerProduct,
	};
};

const resolvePhaseStart = ({
	startsAt,
	currentEpochMs,
}: {
	startsAt: number | "now";
	currentEpochMs: number;
}): number => (startsAt === "now" ? currentEpochMs : startsAt);

/**
 * Setup the sync billing context. Mirrors createSchedule's setup but with
 * Stripe subscription/schedule as the input rather than payment-method
 * driven flow.
 */
export const setupSyncContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: SyncParamsV1;
}): Promise<SyncBillingContext> => {
	if (!params.stripe_subscription_id && !params.stripe_schedule_id) {
		throw new RecaseError({
			message:
				"sync requires either stripe_subscription_id or stripe_schedule_id",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: params.customer_id },
	});

	const [stripeSubscription, stripeSchedule] = await Promise.all([
		fetchStripeSubscription({
			ctx,
			stripeSubscriptionId: params.stripe_subscription_id,
		}),
		fetchStripeSchedule({
			ctx,
			stripeScheduleId: params.stripe_schedule_id,
		}),
	]);

	const currentEpochMs = Date.now();
	const inputPhases = params.phases ?? [];

	const phaseContexts: SyncPhaseContext[] = await Promise.all(
		inputPhases.map(async (phase, index) => {
			const startsAt = resolvePhaseStart({
				startsAt: phase.starts_at,
				currentEpochMs,
			});
			const nextPhase = inputPhases[index + 1];
			const endsAt = nextPhase
				? resolvePhaseStart({
						startsAt: nextPhase.starts_at,
						currentEpochMs,
					})
				: null;

			const isImmediatePhase = phase.starts_at === "now";

			const productContextsPerPlan = await Promise.all(
				phase.plans.map((plan) =>
					buildProductContext({
						ctx,
						fullCustomer,
						plan,
						isImmediate: isImmediatePhase,
					}),
				),
			);

			// Expand add-on plans with quantity > 1 into N independent
			// product contexts so the executor inserts one cusProduct per
			// add-on instance. Non-add-on plans always emit a single context
			// regardless of quantity.
			const productContexts = productContextsPerPlan.flatMap(
				(productContext) => {
					const requested = productContext.plan.quantity ?? 1;
					const shouldExpand =
						productContext.fullProduct.is_add_on === true && requested > 1;
					return shouldExpand
						? Array.from({ length: requested }, () => productContext)
						: [productContext];
				},
			);

			return { startsAt, endsAt, productContexts };
		}),
	);

	const firstPhaseIsImmediate = inputPhases[0]?.starts_at === "now";
	const immediatePhase = firstPhaseIsImmediate
		? (phaseContexts[0] ?? null)
		: null;
	const futurePhases = firstPhaseIsImmediate
		? phaseContexts.slice(1)
		: phaseContexts;

	return {
		customer_id: params.customer_id,
		fullCustomer,
		stripeSubscription,
		stripeSchedule,
		immediatePhase,
		futurePhases,
		currentEpochMs,
		acknowledgedWarnings: params.acknowledge_warnings ?? [],
	};
};
