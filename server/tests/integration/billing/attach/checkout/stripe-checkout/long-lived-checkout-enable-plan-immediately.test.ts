/**
 * Long-lived checkout + enable_plan_immediately
 *
 * Contract:
 * - Creating the link grants the plan immediately (active, no subscription yet).
 * - An expired Stripe session from the link leaves the plan in place; reopening
 *   the link creates a new session for the SAME customer product row.
 * - Paying through the link links the subscription onto that row; reopening the
 *   link afterwards no longer offers payment.
 * - Unpaid plans are expired by the cron once the link's 90 days pass.
 * - A paid session whose webhook is still in flight is neither renewed nor expired.
 * - Renewal drops absolute times (e.g. trial_end) that elapsed since link creation.
 * - Editing the unpaid plan previews its full new price, bills nothing, and keeps the link,
 *   which then sells the edit and grants it on payment; usage on the plan carries over.
 * - A paid one-off purchase from the link is not treated as unpaid by an edit, and an unpaid
 *   one-off edit replaces its credits rather than adding to them.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV1Input,
	CusProductStatus,
	customerProducts,
	customers,
	type DeferredAutumnBillingPlanData,
	metadata,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { waitForStripeWebhook } from "@tests/utils/stripeUtils/waitForStripeWebhook";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { runLongLivedCheckoutExpiry } from "@/cron/longLivedCheckoutCron/runLongLivedCheckoutExpiry";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import {
	getLongLivedCheckoutId,
	getStripeSessionId,
	requestLongLivedCheckoutStart,
	startLongLivedCheckout,
} from "./utils/longLivedCheckoutUtils";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

const setupLongLivedScenario = async ({
	customerId,
	withTrial = false,
	carryUsage = false,
}: {
	customerId: string;
	withTrial?: boolean;
	carryUsage?: boolean;
}) => {
	const productItems = [
		{
			...items.monthlyMessages({ includedUsage: 100 }),
			reset_usage_when_enabled: !carryUsage,
		},
	];
	const pro = withTrial
		? products.proWithTrial({ id: `pro-${customerId}`, items: productItems })
		: products.pro({ id: `pro-${customerId}`, items: productItems });

	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	const dbCustomer = await scenario.ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});

	const result = await scenario.autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		long_lived_checkout: true,
		enable_plan_immediately: true,
	});

	return {
		...scenario,
		pro,
		internalCustomerId: dbCustomer!.internal_id,
		checkoutId: getLongLivedCheckoutId(result.payment_url),
	};
};

const getActiveProRow = async ({
	ctx,
	internalCustomerId,
	productId,
}: {
	ctx: ScenarioCtx;
	internalCustomerId: string;
	productId: string;
}) => {
	const rows = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Active],
	});
	return rows.find((row) => row.product.id === productId);
};

test.concurrent(
	`${chalk.yellowBright("long-lived checkout enable_plan_immediately: grants plan at link creation and survives session expiry")}`,
	async () => {
		const customerId = "ll-eppi-expiry";
		const { autumnV1, ctx, pro, internalCustomerId, checkoutId } =
			await setupLongLivedScenario({ customerId });

		// 1. Plan is active before the link is ever opened.
		const rowAtCreation = await getActiveProRow({
			ctx,
			internalCustomerId,
			productId: pro.id,
		});
		expect(rowAtCreation).toBeDefined();
		expect(rowAtCreation!.subscription_ids ?? []).toHaveLength(0);
		await expectProductActive({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			productId: pro.id,
		});

		// 2. Expiring the Stripe session must not remove the plan. The replay forces
		// delivery, so a timeout with "still no effect" proves the webhook was a no-op.
		const firstSessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		await ctx.stripeCli.checkout.sessions.expire(firstSessionId);

		await expect(
			waitForStripeWebhook({
				stripeCli: ctx.stripeCli,
				env: ctx.env,
				types: ["checkout.session.expired"],
				objectId: firstSessionId,
				until: async () =>
					!(await getActiveProRow({
						ctx,
						internalCustomerId,
						productId: pro.id,
					})),
				replayAfterMs: 5_000,
				timeoutMs: 15_000,
			}),
		).rejects.toThrow("still no effect");

		// 3. Reopening creates a new session against the same row.
		const secondSessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		expect(secondSessionId).not.toBe(firstSessionId);

		const rowAfterReopen = await getActiveProRow({
			ctx,
			internalCustomerId,
			productId: pro.id,
		});
		expect(rowAfterReopen?.id).toBe(rowAtCreation!.id);
		expect(rowAfterReopen?.stripe_checkout_session_id).toBe(secondSessionId);
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout enable_plan_immediately: paying links the subscription onto the same row")}`,
	async () => {
		const customerId = "ll-eppi-paid";
		const { ctx, pro, internalCustomerId, checkoutId } =
			await setupLongLivedScenario({ customerId });

		const rowAtCreation = await getActiveProRow({
			ctx,
			internalCustomerId,
			productId: pro.id,
		});

		const stripeUrl = await startLongLivedCheckout(checkoutId);
		await completeStripeCheckoutForm({ url: stripeUrl });

		await waitForStripeWebhook({
			stripeCli: ctx.stripeCli,
			env: ctx.env,
			types: ["checkout.session.completed"],
			objectId: getStripeSessionId(stripeUrl),
			until: async () => {
				const row = await getActiveProRow({
					ctx,
					internalCustomerId,
					productId: pro.id,
				});
				return (row?.subscription_ids ?? []).length === 1;
			},
		});

		const paidRow = await getActiveProRow({
			ctx,
			internalCustomerId,
			productId: pro.id,
		});
		expect(paidRow?.id).toBe(rowAtCreation!.id);

		const reopen = await requestLongLivedCheckoutStart(checkoutId);
		expect(reopen.status).toBe(409);
		expect((await reopen.json()).code).toBe("checkout_completed");
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout enable_plan_immediately: cron expires unpaid plan after link expiry")}`,
	async () => {
		const customerId = "ll-eppi-cron";
		const { autumnV1, ctx, pro, internalCustomerId, checkoutId } =
			await setupLongLivedScenario({ customerId });

		const sessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		const pendingMetadata = await ctx.db.query.metadata.findFirst({
			where: eq(metadata.stripe_checkout_session_id, sessionId),
		});
		expect(pendingMetadata).toBeDefined();

		// 1. Before the link expires, the cron leaves the plan alone.
		await runLongLivedCheckoutExpiry({ ctx });
		expect(
			await getActiveProRow({ ctx, internalCustomerId, productId: pro.id }),
		).toBeDefined();

		// 2. Once expired, the cron removes the unpaid plan.
		await ctx.db
			.update(metadata)
			.set({ expires_at: Date.now() - 1000 })
			.where(eq(metadata.id, pendingMetadata!.id));
		await runLongLivedCheckoutExpiry({ ctx });

		expect(
			await getActiveProRow({ ctx, internalCustomerId, productId: pro.id }),
		).toBeUndefined();
		await expectProductNotPresent({
			customerId,
			autumn: autumnV1,
			productId: pro.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout enable_plan_immediately: paid session awaiting its webhook is neither expired nor renewed")}`,
	async () => {
		const customerId = "ll-eppi-paid-inflight";
		const { ctx, pro, internalCustomerId, checkoutId } =
			await setupLongLivedScenario({ customerId });

		const stripeUrl = await startLongLivedCheckout(checkoutId);
		const sessionId = getStripeSessionId(stripeUrl);
		const pendingMetadata = await ctx.db.query.metadata.findFirst({
			where: eq(metadata.stripe_checkout_session_id, sessionId),
		});

		await completeStripeCheckoutForm({ url: stripeUrl });
		await waitForStripeWebhook({
			stripeCli: ctx.stripeCli,
			env: ctx.env,
			types: ["checkout.session.completed"],
			objectId: sessionId,
			until: async () => {
				const row = await getActiveProRow({
					ctx,
					internalCustomerId,
					productId: pro.id,
				});
				return (row?.subscription_ids ?? []).length === 1;
			},
		});

		// Rewind Autumn to "paid in Stripe, completion webhook not yet processed", past the deadline.
		const paidRow = await getActiveProRow({
			ctx,
			internalCustomerId,
			productId: pro.id,
		});
		await ctx.db
			.insert(metadata)
			.values({ ...pendingMetadata!, expires_at: Date.now() - 1000 });
		await ctx.db
			.update(customerProducts)
			.set({ subscription_ids: [] })
			.where(eq(customerProducts.id, paidRow!.id));

		// 1. The cron leaves the paid plan for the webhook and rechecks later.
		await runLongLivedCheckoutExpiry({ ctx });
		expect(
			(await getActiveProRow({ ctx, internalCustomerId, productId: pro.id }))
				?.id,
		).toBe(paidRow!.id);
		const postponedMetadata = await ctx.db.query.metadata.findFirst({
			where: eq(metadata.id, pendingMetadata!.id),
		});
		expect(Number(postponedMetadata?.expires_at)).toBeGreaterThan(Date.now());

		// 2. Reopening does not offer payment again.
		const reopen = await requestLongLivedCheckoutStart(checkoutId);
		expect(reopen.status).toBe(409);
		expect((await reopen.json()).code).toBe("checkout_completed");
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout enable_plan_immediately: renewal drops an elapsed trial end")}`,
	async () => {
		const customerId = "ll-eppi-trial-elapsed";
		const { ctx, checkoutId } = await setupLongLivedScenario({
			customerId,
			withTrial: true,
		});

		const sessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		const pendingMetadata = await ctx.db.query.metadata.findFirst({
			where: eq(metadata.stripe_checkout_session_id, sessionId),
		});
		const data = pendingMetadata!.data as DeferredAutumnBillingPlanData;
		const subscriptionData =
			data.billingPlan.stripe.checkoutSessionAction!.params.subscription_data!;
		expect(subscriptionData.trial_end).toBeDefined();

		// Simulate opening the link after the quoted trial would have ended.
		subscriptionData.trial_end = Math.floor(Date.now() / 1000) - 3600;
		await ctx.db
			.update(metadata)
			.set({ data })
			.where(eq(metadata.id, pendingMetadata!.id));
		await ctx.stripeCli.checkout.sessions.expire(sessionId);

		const renewedSessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		expect(renewedSessionId).not.toBe(sessionId);
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout enable_plan_immediately: editing the unpaid plan keeps the link and bills nothing")}`,
	async () => {
		const customerId = "ll-eppi-edit";
		const { autumnV1, autumnV2_2, ctx, pro, internalCustomerId, checkoutId } =
			await setupLongLivedScenario({ customerId, carryUsage: true });

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 60,
		});
		await expectCustomerFeatureCorrect({
			customerId,
			autumn: autumnV1,
			featureId: TestFeature.Messages,
			balance: 40,
		});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 10 }) },
		};

		// 1. Nothing was paid, so a price cut previews the full new price with no credit.
		const preview =
			await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		expect(preview.total).toBe(10);

		// 2. The edit returns the same link and creates no Stripe subscription or invoice.
		const updateResult =
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		expect(getLongLivedCheckoutId(updateResult.payment_url)).toBe(checkoutId);

		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		const stripeCustomerId = dbCustomer!.processor!.id;
		const [subscriptions, invoices] = await Promise.all([
			ctx.stripeCli.subscriptions.list({
				customer: stripeCustomerId,
				status: "all",
			}),
			ctx.stripeCli.invoices.list({ customer: stripeCustomerId }),
		]);
		expect(subscriptions.data).toHaveLength(0);
		expect(invoices.data).toHaveLength(0);

		// 3. The plan stays granted with its usage, and the link sells the edited price.
		expect(
			await getActiveProRow({ ctx, internalCustomerId, productId: pro.id }),
		).toBeDefined();
		await expectCustomerFeatureCorrect({
			customerId,
			autumn: autumnV1,
			featureId: TestFeature.Messages,
			balance: 40,
		});
		const stripeUrl = await startLongLivedCheckout(checkoutId);
		const session = await ctx.stripeCli.checkout.sessions.retrieve(
			getStripeSessionId(stripeUrl),
		);
		expect(session.amount_total).toBe(1000);

		// 4. Paying the link links the subscription onto the edited plan.
		await completeStripeCheckoutForm({ url: stripeUrl });
		await waitForStripeWebhook({
			stripeCli: ctx.stripeCli,
			env: ctx.env,
			types: ["checkout.session.completed"],
			objectId: session.id,
			until: async () => {
				const row = await getActiveProRow({
					ctx,
					internalCustomerId,
					productId: pro.id,
				});
				return (row?.subscription_ids ?? []).length === 1;
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout enable_plan_immediately: editing a paid one-off purchase leaves it in place")}`,
	async () => {
		const customerId = "ll-eppi-one-off-paid";
		const oneOff = products.oneOff({
			id: `one-off-${customerId}`,
			items: [
				items.oneOffMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
				}),
			],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [oneOff] })],
			actions: [],
		});
		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		const internalCustomerId = dbCustomer!.internal_id;

		const attachResult = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: oneOff.id,
			long_lived_checkout: true,
			enable_plan_immediately: true,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});
		const stripeUrl = await startLongLivedCheckout(
			getLongLivedCheckoutId(attachResult.payment_url),
		);
		await completeStripeCheckoutForm({ url: stripeUrl });
		await waitForStripeWebhook({
			stripeCli: ctx.stripeCli,
			env: ctx.env,
			types: ["checkout.session.completed"],
			objectId: getStripeSessionId(stripeUrl),
			until: async () =>
				!(await ctx.db.query.metadata.findFirst({
					where: eq(
						metadata.stripe_checkout_session_id,
						getStripeSessionId(stripeUrl),
					),
				})),
		});
		const paidRow = await getActiveProRow({
			ctx,
			internalCustomerId,
			productId: oneOff.id,
		});
		expect(paidRow).toBeDefined();

		await autumnV2_2.subscriptions
			.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: oneOff.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 200 },
				],
			})
			.catch(() => undefined);

		expect(
			(await getActiveProRow({ ctx, internalCustomerId, productId: oneOff.id }))
				?.id,
		).toBe(paidRow!.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout enable_plan_immediately: editing an unpaid one-off quantity replaces its credits")}`,
	async () => {
		const customerId = "ll-eppi-one-off-edit";
		const oneOff = products.oneOff({
			id: `one-off-${customerId}`,
			items: [
				items.oneOffMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
				}),
			],
		});
		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [oneOff] })],
			actions: [],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: oneOff.id,
			long_lived_checkout: true,
			enable_plan_immediately: true,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});
		await expectCustomerFeatureCorrect({
			customerId,
			autumn: autumnV1,
			featureId: TestFeature.Messages,
			balance: 100,
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: oneOff.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});

		await expectCustomerFeatureCorrect({
			customerId,
			autumn: autumnV1,
			featureId: TestFeature.Messages,
			balance: 200,
		});
	},
);
