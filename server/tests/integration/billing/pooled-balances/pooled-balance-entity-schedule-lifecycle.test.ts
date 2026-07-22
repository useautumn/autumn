/**
 * Server-backed pooled-balance lifecycle coverage for entity deletion and time
 * boundaries.
 *
 * Harness notes:
 * - The public API only supports `ends_at` for paid plans, so the automatic
 *   expiry contract uses a real Stripe test clock and webhook delivery.
 * - The integration harness has no public endpoint for deterministic replay of
 *   a subscription phase boundary. The activation-idempotency case therefore
 *   invokes the production subscription.updated handler with its real DB plan.
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type AttachParamsV1Input,
	type CheckResponseV3,
	CusProductStatus,
	customerEntitlements,
	customerProducts,
	customers,
	FreeTrialDuration,
	ms,
	pooledBalanceContributions,
	pooledBalances,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/index.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext.js";
import { handleSchedulePhaseChanges } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/handleSchedulePhaseChanges/handleSchedulePhaseChanges.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { CusService } from "@/internal/customers/CusService.js";
import { timeout } from "@/utils/genUtils.js";

const POOLED_GRANT = 500;
const CONSUMED_USAGE = 400;

const pooledMessagesItem = () => ({
	...items.monthlyMessages({ includedUsage: POOLED_GRANT }),
	pooled: true,
});

const getPooledLifecycleState = async ({
	ctx,
	customerId,
	sourceCustomerProductId,
}: {
	ctx: TestContext;
	customerId: string;
	sourceCustomerProductId: string;
}) => {
	const internalCustomer = await ctx.db.query.customers.findFirst({
		where: and(
			eq(customers.id, customerId),
			eq(customers.org_id, ctx.org.id),
			eq(customers.env, ctx.env),
		),
	});
	if (!internalCustomer) {
		throw new Error(`Customer '${customerId}' not found`);
	}

	const pools = await ctx.db.query.pooledBalances.findMany({
		where: eq(
			pooledBalances.internal_customer_id,
			internalCustomer.internal_id,
		),
	});
	const poolCustomerEntitlements =
		pools.length === 0
			? []
			: await ctx.db.query.customerEntitlements.findMany({
					where: inArray(
						customerEntitlements.id,
						pools.map((pool) => pool.customer_entitlement_id),
					),
				});
	const contributions = await ctx.db.query.pooledBalanceContributions.findMany({
		where: eq(
			pooledBalanceContributions.source_customer_product_id,
			sourceCustomerProductId,
		),
	});
	const sourceCustomerProduct = await ctx.db.query.customerProducts.findFirst({
		where: eq(customerProducts.id, sourceCustomerProductId),
	});

	return {
		contributions,
		poolCustomerEntitlements,
		pools,
		sourceCustomerProduct,
	};
};

const getEntityCustomerProduct = async ({
	ctx,
	customerId,
	entityId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	entityId: string;
	productId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
	const customerProduct = fullCustomer.customer_products.find(
		(candidate) =>
			candidate.product.id === productId && candidate.entity_id === entityId,
	);
	if (!customerProduct) {
		throw new Error(`Entity product '${productId}@${entityId}' not found`);
	}
	return customerProduct;
};

const expectRetainedPooledDebt = async ({
	ctx,
	autumnV2_2,
	customerId,
	consumerEntityId,
	sourceCustomerProductId,
}: {
	ctx: TestContext;
	autumnV2_2: Awaited<ReturnType<typeof initScenario>>["autumnV2_2"];
	customerId: string;
	consumerEntityId: string;
	sourceCustomerProductId: string;
}) => {
	const state = await getPooledLifecycleState({
		ctx,
		customerId,
		sourceCustomerProductId,
	});
	expect(state.pools).toHaveLength(1);
	expect(state.poolCustomerEntitlements).toHaveLength(1);
	expect(state.poolCustomerEntitlements[0]).toMatchObject({
		adjustment: 0,
		balance: -CONSUMED_USAGE,
	});
	expect(state.contributions).toHaveLength(1);
	expect(state.contributions[0]).toMatchObject({
		current_contribution: 0,
		next_cycle_contribution: 0,
	});

	const check = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: consumerEntityId,
		feature_id: TestFeature.Messages,
		skip_cache: true,
	});
	expect(check.allowed).toBe(false);
	expect(check.balance).toMatchObject({
		granted: 0,
		remaining: 0,
		usage: CONSUMED_USAGE,
	});
};

const triggerScheduleActivation = async ({
	ctx,
	customerId,
	stripeSubscriptionId,
	stripeScheduleId,
	nowMs,
}: {
	ctx: TestContext;
	customerId: string;
	stripeSubscriptionId: string;
	stripeScheduleId: string;
	nowMs: number;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
	await handleSchedulePhaseChanges({
		ctx: {
			...ctx,
			fullCustomer,
			stripeEvent: {} as StripeWebhookContext["stripeEvent"],
		},
		eventContext: {
			stripeSubscription: {
				id: stripeSubscriptionId,
				schedule: { id: stripeScheduleId },
			},
			previousAttributes: { status: "trialing" },
			fullCustomer,
			customerProducts: [...fullCustomer.customer_products],
			nowMs,
			updatedCustomerProducts: [],
			deletedCustomerProducts: [],
			insertedCustomerProducts: [],
		} as unknown as StripeSubscriptionUpdatedContext,
	});
};

test.concurrent(
	`${chalk.yellowBright("pooled entity deletion: free source expires once and retained usage becomes debt")}`,
	async () => {
		const freePooledPlan = products.base({
			id: "pooled-free-entity-delete",
			items: [pooledMessagesItem()],
		});

		const { customerId, entities, autumnV1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "pooled-free-entity-delete",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [freePooledPlan] }),
				],
				actions: [
					s.billing.attach({
						productId: freePooledPlan.id,
						entityIndex: 0,
					}),
					s.track({
						featureId: TestFeature.Messages,
						value: CONSUMED_USAGE,
						entityIndex: 1,
						timeout: 2000,
					}),
				],
			});

		const sourceCustomerProduct = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[0].id,
			productId: freePooledPlan.id,
		});
		const beforeDeletion = await getPooledLifecycleState({
			ctx,
			customerId,
			sourceCustomerProductId: sourceCustomerProduct.id,
		});
		expect(beforeDeletion.contributions).toHaveLength(1);
		expect(beforeDeletion.contributions[0]).toMatchObject({
			current_contribution: POOLED_GRANT,
			next_cycle_contribution: POOLED_GRANT,
		});
		expect(beforeDeletion.poolCustomerEntitlements[0]).toMatchObject({
			adjustment: POOLED_GRANT,
			balance: POOLED_GRANT - CONSUMED_USAGE,
		});

		await autumnV1.entities.delete(customerId, entities[0].id);

		await expectRetainedPooledDebt({
			ctx,
			autumnV2_2,
			customerId,
			consumerEntityId: entities[1].id,
			sourceCustomerProductId: sourceCustomerProduct.id,
		});
		const afterDeletion = await getPooledLifecycleState({
			ctx,
			customerId,
			sourceCustomerProductId: sourceCustomerProduct.id,
		});
		expect(afterDeletion.sourceCustomerProduct).toMatchObject({
			status: CusProductStatus.Expired,
		});
		expect(afterDeletion.sourceCustomerProduct?.ended_at).toBeNumber();
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled entity deletion: paid source delegates cancellation without duplicate removal")}`,
	async () => {
		const paidPooledPlan = products.pro({
			id: "pooled-paid-entity-delete",
			items: [pooledMessagesItem()],
		});

		const { customerId, entities, autumnV1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "pooled-paid-entity-delete",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [paidPooledPlan] }),
				],
				actions: [
					s.billing.attach({
						productId: paidPooledPlan.id,
						entityIndex: 0,
					}),
					s.track({
						featureId: TestFeature.Messages,
						value: CONSUMED_USAGE,
						entityIndex: 1,
						timeout: 2000,
					}),
				],
			});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
		const sourceCustomerProduct = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[0].id,
			productId: paidPooledPlan.id,
		});
		expect(sourceCustomerProduct.subscription_ids).toHaveLength(1);

		await autumnV1.entities.delete(customerId, entities[0].id);

		await expectRetainedPooledDebt({
			ctx,
			autumnV2_2,
			customerId,
			consumerEntityId: entities[1].id,
			sourceCustomerProductId: sourceCustomerProduct.id,
		});
		const afterDeletion = await getPooledLifecycleState({
			ctx,
			customerId,
			sourceCustomerProductId: sourceCustomerProduct.id,
		});
		expect(afterDeletion.sourceCustomerProduct).toMatchObject({
			status: CusProductStatus.Expired,
		});
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
	90_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled future attach: no contribution before start and activation is idempotent")}`,
	async () => {
		const futurePooledPlan = products.pro({
			id: "pooled-future-activation",
			items: [pooledMessagesItem()],
		});

		const { customerId, entities, autumnV2_2, ctx, advancedTo } =
			await initScenario({
				customerId: "pooled-future-activation",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [futurePooledPlan] }),
				],
				actions: [],
			});

		const startsAt = advancedTo + ms.days(1);
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: futurePooledPlan.id,
			starts_at: startsAt,
		});

		const scheduledCustomerProduct = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[0].id,
			productId: futurePooledPlan.id,
		});
		expect(scheduledCustomerProduct).toMatchObject({
			status: CusProductStatus.Scheduled,
			starts_at: startsAt,
		});
		expect(scheduledCustomerProduct.scheduled_ids).toHaveLength(1);
		const beforeActivation = await getPooledLifecycleState({
			ctx,
			customerId,
			sourceCustomerProductId: scheduledCustomerProduct.id,
		});
		expect(beforeActivation.pools).toHaveLength(0);
		expect(beforeActivation.contributions).toHaveLength(0);

		const stripeScheduleId = scheduledCustomerProduct.scheduled_ids![0]!;
		const stripeSubscriptionId = "sub_pooled_future_activation";
		for (let attempt = 0; attempt < 2; attempt += 1) {
			await triggerScheduleActivation({
				ctx,
				customerId,
				stripeSubscriptionId,
				stripeScheduleId,
				nowMs: startsAt + ms.minutes(5),
			});
		}

		const activatedCustomerProduct = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[0].id,
			productId: futurePooledPlan.id,
		});
		expect(activatedCustomerProduct).toMatchObject({
			status: CusProductStatus.Active,
			subscription_ids: [stripeSubscriptionId],
		});
		const afterActivation = await getPooledLifecycleState({
			ctx,
			customerId,
			sourceCustomerProductId: scheduledCustomerProduct.id,
		});
		expect(afterActivation.pools).toHaveLength(1);
		expect(afterActivation.poolCustomerEntitlements).toHaveLength(1);
		expect(afterActivation.poolCustomerEntitlements[0]).toMatchObject({
			adjustment: POOLED_GRANT,
			balance: POOLED_GRANT,
		});
		expect(afterActivation.contributions).toHaveLength(1);
		expect(afterActivation.contributions[0]).toMatchObject({
			current_contribution: POOLED_GRANT,
			next_cycle_contribution: POOLED_GRANT,
			reset_owner_id: stripeSubscriptionId,
		});

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.balance).toMatchObject({
			granted: POOLED_GRANT,
			remaining: POOLED_GRANT,
			usage: 0,
		});
	},
	90_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled future attach: cancel before start never creates a contribution")}`,
	async () => {
		const futurePooledPlan = products.pro({
			id: "pooled-future-cancel",
			items: [pooledMessagesItem()],
		});

		const { customerId, entities, autumnV2_2, ctx, advancedTo } =
			await initScenario({
				customerId: "pooled-future-cancel",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
					s.products({ list: [futurePooledPlan] }),
				],
				actions: [],
			});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: futurePooledPlan.id,
			starts_at: advancedTo + ms.days(1),
		});
		const scheduledCustomerProduct = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[0].id,
			productId: futurePooledPlan.id,
		});
		const stripeScheduleId = scheduledCustomerProduct.scheduled_ids?.[0];
		if (!stripeScheduleId) {
			throw new Error("Expected future pooled product to have a schedule");
		}

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: scheduledCustomerProduct.id,
			cancel_action: "cancel_immediately",
		});

		const afterCancel = await getPooledLifecycleState({
			ctx,
			customerId,
			sourceCustomerProductId: scheduledCustomerProduct.id,
		});
		expect(afterCancel.sourceCustomerProduct).toBeUndefined();
		expect(afterCancel.pools).toHaveLength(0);
		expect(afterCancel.contributions).toHaveLength(0);
		const stripeSchedule =
			await ctx.stripeCli.subscriptionSchedules.retrieve(stripeScheduleId);
		expect(stripeSchedule.status).toBe("canceled");
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled immediate cancellation: entity default successor is funded atomically")}`,
	async () => {
		const defaultPlan = products.base({
			id: "pooled-entity-default-successor",
			items: [pooledMessagesItem()],
			isDefault: true,
		});
		const paidPlan = products.pro({
			id: "pooled-paid-before-default",
			items: [pooledMessagesItem()],
		});
		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "pooled-immediate-default-successor",
			setup: [
				s.platform.create({
					configOverrides: { default_applies_to_entities: true },
					setupDefaultFeatures: true,
				}),
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [defaultPlan, paidPlan] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: paidPlan.id, entityIndex: 0 })],
		});
		const paidCustomerProduct = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[0].id,
			productId: paidPlan.id,
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: paidCustomerProduct.id,
			entity_id: entities[0].id,
			cancel_action: "cancel_immediately",
		});

		const defaultCustomerProduct = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[0].id,
			productId: defaultPlan.id,
		});
		expect(defaultCustomerProduct.status).toBe(CusProductStatus.Active);
		expect(defaultCustomerProduct.customer_entitlements[0]?.balance).toBe(0);
		const state = await getPooledLifecycleState({
			ctx,
			customerId,
			sourceCustomerProductId: defaultCustomerProduct.id,
		});
		expect(state.contributions).toHaveLength(1);
		const contribution = state.contributions[0];
		const activePool = state.pools.find(
			(pool) => pool.id === contribution?.pooled_balance_id,
		);
		const activePoolCustomerEntitlement = state.poolCustomerEntitlements.find(
			(customerEntitlement) =>
				customerEntitlement.id === activePool?.customer_entitlement_id,
		);
		expect(activePool).toBeDefined();
		expect(activePoolCustomerEntitlement).toMatchObject({
			adjustment: POOLED_GRANT,
			balance: POOLED_GRANT,
		});
		expect(contribution).toMatchObject({
			current_contribution: POOLED_GRANT,
			next_cycle_contribution: POOLED_GRANT,
		});
	},
	90_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled revert trial: immediate cancellation restores the paused source contribution")}`,
	async () => {
		const pooledPlan = products.pro({
			id: "pooled-before-revert-trial",
			items: [pooledMessagesItem()],
		});
		const trialPlan = products.base({
			id: "ordinary-revert-trial",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 50 }),
			],
		});
		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "pooled-revert-trial-cancel",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan, trialPlan] }),
			],
			actions: [s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 })],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: trialPlan.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 2,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		});
		const duringTrial = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
			inStatuses: ALL_STATUSES,
		});
		const trialCustomerProduct = duringTrial.customer_products.find(
			(customerProduct) =>
				customerProduct.product.id === trialPlan.id &&
				customerProduct.status === CusProductStatus.Active,
		);
		const pausedPooledCustomerProduct = duringTrial.customer_products.find(
			(customerProduct) => customerProduct.product.id === pooledPlan.id,
		);
		if (!trialCustomerProduct || !pausedPooledCustomerProduct) {
			throw new Error("Expected trial and paused pooled source");
		}
		expect(pausedPooledCustomerProduct.status).toBe(CusProductStatus.Paused);
		const removedState = await getPooledLifecycleState({
			ctx,
			customerId,
			sourceCustomerProductId: pausedPooledCustomerProduct.id,
		});
		expect(removedState.contributions[0]).toMatchObject({
			current_contribution: 0,
			next_cycle_contribution: 0,
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: trialCustomerProduct.id,
			entity_id: entities[0].id,
			cancel_action: "cancel_immediately",
		});

		const afterCancel = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
			inStatuses: ALL_STATUSES,
		});
		expect(
			afterCancel.customer_products.find(
				(customerProduct) =>
					customerProduct.id === pausedPooledCustomerProduct.id,
			),
		).toMatchObject({ status: CusProductStatus.Active });
		const restoredState = await getPooledLifecycleState({
			ctx,
			customerId,
			sourceCustomerProductId: pausedPooledCustomerProduct.id,
		});
		expect(restoredState.contributions).toHaveLength(1);
		expect(restoredState.contributions[0]).toMatchObject({
			current_contribution: POOLED_GRANT,
			next_cycle_contribution: POOLED_GRANT,
		});
		expect(restoredState.poolCustomerEntitlements[0]).toMatchObject({
			adjustment: POOLED_GRANT,
			balance: POOLED_GRANT,
		});
	},
	120_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled ends_at: automatic Stripe expiry removes the contribution once and keeps debt")}`,
	async () => {
		const boundedPooledPlan = products.pro({
			id: "pooled-ends-at-expiry",
			items: [pooledMessagesItem()],
		});

		const { customerId, entities, autumnV2_2, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "pooled-ends-at-expiry",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [boundedPooledPlan] }),
				],
				actions: [],
			});

		if (!testClockId) throw new Error("Expected a Stripe test clock");
		const endsAt = advancedTo + ms.days(7);
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: boundedPooledPlan.id,
			ends_at: endsAt,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		const sourceCustomerProduct = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[0].id,
			productId: boundedPooledPlan.id,
		});
		expect(sourceCustomerProduct).toMatchObject({
			status: CusProductStatus.Active,
			ended_at: endsAt,
		});
		const stripeSubscriptionId = sourceCustomerProduct.subscription_ids?.[0];
		if (!stripeSubscriptionId) {
			throw new Error("Expected bounded pooled product to have a subscription");
		}
		const stripeSubscription = (await ctx.stripeCli.subscriptions.retrieve(
			stripeSubscriptionId,
		)) as Stripe.Subscription;
		expect(stripeSubscription.cancel_at).toBe(Math.floor(endsAt / 1000));

		await autumnV2_2.track(
			{
				customer_id: customerId,
				entity_id: entities[1].id,
				feature_id: TestFeature.Messages,
				value: CONSUMED_USAGE,
			},
			{ timeout: 2000 },
		);
		const beforeExpiry = await getPooledLifecycleState({
			ctx,
			customerId,
			sourceCustomerProductId: sourceCustomerProduct.id,
		});
		expect(beforeExpiry.contributions).toHaveLength(1);
		expect(beforeExpiry.contributions[0]).toMatchObject({
			current_contribution: POOLED_GRANT,
			next_cycle_contribution: POOLED_GRANT,
		});
		expect(beforeExpiry.poolCustomerEntitlements[0]).toMatchObject({
			adjustment: POOLED_GRANT,
			balance: POOLED_GRANT - CONSUMED_USAGE,
		});

		// Allow the short-lived Autumn mutation lock to expire so the real
		// Stripe-driven deletion webhook owns this automatic boundary.
		await timeout(3500);
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: endsAt + ms.hours(1),
			waitForSeconds: 30,
		});

		await expectRetainedPooledDebt({
			ctx,
			autumnV2_2,
			customerId,
			consumerEntityId: entities[1].id,
			sourceCustomerProductId: sourceCustomerProduct.id,
		});
		const afterExpiry = await getPooledLifecycleState({
			ctx,
			customerId,
			sourceCustomerProductId: sourceCustomerProduct.id,
		});
		expect(afterExpiry.sourceCustomerProduct).toMatchObject({
			status: CusProductStatus.Expired,
			ended_at: endsAt,
		});
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
	120_000,
);
