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
} from "@autumn/shared";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
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
}: {
	customerId: string;
	withTrial?: boolean;
}) => {
	const productItems = [items.monthlyMessages({ includedUsage: 100 })];
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
