import {
	cp,
	type Entity,
	EntityNotFoundError,
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
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupAttachProductContext } from "@/internal/billing/v2/actions/attach/setup/setupAttachProductContext";
import { setupAttachTransitionContext } from "@/internal/billing/v2/actions/attach/setup/setupAttachTransitionContext";
import {
	fetchStripeSyncSchedule,
	fetchStripeSyncSubscription,
} from "@/internal/billing/v2/providers/stripe/utils/sync/fetchStripeSyncObjects";
import { resolveStripeSyncCurrency } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/resolveStripeSyncCurrency";
import { setupCustomerLicenseQuantityContext } from "@/internal/billing/v2/setup/setupCustomerLicenseQuantityContext";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { resolveCarryOverUsagesParam } from "@/internal/billing/v2/utils/handleCarryOvers/resolveCarryOverUsagesParam";
import { prepareSyncedCustomBasePrice } from "./prepareSyncedCustomBasePrice";

const resolvePlanEntity = ({
	plan,
	fullCustomer,
}: {
	plan: SyncPlanInstance;
	fullCustomer: FullCustomer;
}): Entity | undefined => {
	if (!plan.entity_id) return undefined;
	const entity = fullCustomer.entities.find(
		(e) => e.id === plan.entity_id || e.internal_id === plan.entity_id,
	);
	if (!entity) {
		throw new EntityNotFoundError({ entityId: plan.entity_id });
	}
	return entity;
};

const findLinkedAddOnCustomerProduct = ({
	fullCustomer,
	fullProduct,
	stripeSubscriptionId,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	fullProduct: SyncProductContext["fullProduct"];
	stripeSubscriptionId: string;
	internalEntityId?: string;
}): FullCusProduct | undefined =>
	fullCustomer.customer_products.find((customerProduct) => {
		if (customerProduct.product?.id !== fullProduct.id) return false;
		if ((customerProduct.internal_entity_id ?? undefined) !== internalEntityId)
			return false;
		return cp(customerProduct)
			.hasActiveStatus()
			.onStripeSubscription({ stripeSubscriptionId }).valid;
	});

const buildProductContext = async ({
	ctx,
	fullCustomer,
	plan,
	shouldFindCurrentCustomerProduct,
	accessStartsAt,
	stripeSubscriptionId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	plan: SyncPlanInstance;
	shouldFindCurrentCustomerProduct: boolean;
	accessStartsAt?: number;
	stripeSubscriptionId?: string;
}): Promise<SyncProductContext> => {
	const {
		fullProduct,
		customPrices = [],
		customEnts: customEntitlements = [],
		insertPlanLicenses,
	} = await setupAttachProductContext({ ctx, params: plan });

	const customerLicenseQuantities = setupCustomerLicenseQuantityContext({
		params: plan,
	});

	const featureQuantities = setupFeatureQuantitiesContext({
		ctx,
		featureQuantitiesParams: { feature_quantities: plan.feature_quantities },
		fullProduct,
		initializeUndefinedQuantities: true,
	});

	const entity = resolvePlanEntity({ plan, fullCustomer });

	let currentCustomerProduct: FullCusProduct | undefined;
	if (shouldFindCurrentCustomerProduct) {
		if (fullProduct.is_add_on === true) {
			// Add-ons have no group transition; a re-sync replaces the existing
			// same-product instance linked to this Stripe subscription so
			// quantity changes and webhook re-deliveries converge.
			currentCustomerProduct = stripeSubscriptionId
				? findLinkedAddOnCustomerProduct({
						fullCustomer,
						fullProduct,
						stripeSubscriptionId,
						internalEntityId: entity?.internal_id,
					})
				: undefined;
		} else {
			const transition = setupAttachTransitionContext({
				fullCustomer,
				attachProduct: fullProduct,
				// Scope the "previous product to expire" lookup to the plan's entity
				// so an entity-scoped sync replaces the existing product on that
				// same entity rather than missing it (which would duplicate).
				internalEntityId: entity?.internal_id,
			});
			currentCustomerProduct = transition.currentCustomerProduct;
		}
	}
	const preparedCustomBase = prepareSyncedCustomBasePrice({
		currentCustomerProduct,
		fullProduct,
		customPrices,
		plan,
	});

	return {
		plan,
		fullProduct: preparedCustomBase.fullProduct,
		customPrices: preparedCustomBase.customPrices,
		customEntitlements,
		featureQuantities,
		customerLicenseQuantities,
		insertPlanLicenses,
		entity,
		currentCustomerProduct,
		accessStartsAt,
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

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const [stripeSubscription, stripeSchedule] = await Promise.all([
		fetchStripeSyncSubscription({
			stripeCli,
			subscriptionId: params.stripe_subscription_id,
		}),
		fetchStripeSyncSchedule({
			stripeCli,
			scheduleId: params.stripe_schedule_id,
		}),
	]);
	const currency = resolveStripeSyncCurrency({
		subscription: stripeSubscription,
		schedule: stripeSchedule,
		customerCurrency: fullCustomer.currency,
	});

	const currentEpochMs = Date.now();
	const inputPhases = params.phases ?? [];
	const firstPhaseIsImmediate = inputPhases[0]?.starts_at === "now";

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

			const productContextsPerPlan = await Promise.all(
				phase.plans.map((plan) =>
					buildProductContext({
						ctx,
						fullCustomer,
						plan,
						// Future phases also expire the current same-group product on
						// expire_previous — computeSyncFuturePhases relies on it being
						// set, not just the immediate/enable-now cases.
						shouldFindCurrentCustomerProduct: plan.expire_previous === true,
						accessStartsAt: plan.enable_plan_immediately
							? currentEpochMs
							: undefined,
						stripeSubscriptionId: params.stripe_subscription_id,
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
		currency,
		immediatePhase,
		futurePhases,
		currentEpochMs,
		acknowledgedWarnings: params.acknowledge_warnings ?? [],
		carryOverUsage: params.carry_over_usage ?? true,
		carryOverUsages: await resolveCarryOverUsagesParam({
			ctx,
			carryOverUsages: undefined,
		}),
	};
};
