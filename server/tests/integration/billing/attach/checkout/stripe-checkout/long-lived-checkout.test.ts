import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	CusProductStatus,
	customers,
	metadata,
} from "@autumn/shared";
import { ms } from "@shared/utils/common/unixUtils";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { waitForStripeWebhook } from "@tests/utils/stripeUtils/waitForStripeWebhook";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { runLongLivedCheckoutExpiry } from "@/cron/longLivedCheckoutCron/runLongLivedCheckoutExpiry";
import { checkoutRepo } from "@/internal/checkouts/repos/checkoutRepo";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import {
	getLongLivedCheckoutId,
	getStripeSessionId,
	startLongLivedCheckout,
} from "./utils/longLivedCheckoutUtils";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

const DELIVERED_WITHOUT_EFFECT =
	/replay: [1-9]\d*\/\d+ event\(s\) \[evt_\w+→200\b.*still no effect/;

const setupDeferredLongLivedScenario = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const pro = products.pro({
		id: `pro-${customerId}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

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
	});

	return {
		...scenario,
		pro,
		internalCustomerId: dbCustomer!.internal_id,
		checkoutId: getLongLivedCheckoutId(result.payment_url),
	};
};

const getPendingProRow = async ({
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
		inStatuses: [CusProductStatus.Pending],
	});
	return rows.find((row) => row.product.id === productId);
};

const expectStoredPaymentUrl = async ({
	ctx,
	checkoutId,
	paymentUrl,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	checkoutId: string;
	paymentUrl: string;
}) => {
	const checkout = await checkoutRepo.get({ db: ctx.db, id: checkoutId });
	expect(checkout?.response?.payment_url).toBe(paymentUrl);
};

const expectLongLivedCheckoutExpiry = async ({
	ctx,
	checkoutId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	checkoutId: string;
}) => {
	const checkout = await checkoutRepo.get({ db: ctx.db, id: checkoutId });
	expect(checkout?.expires_at).toBe(checkout!.created_at + ms.days(90));
};

test.concurrent(
	`${chalk.yellowBright("long-lived checkout: creates reusable launcher for stripe checkout")}`,
	async () => {
		const customerId = "long-lived-checkout";
		const pro = products.pro({
			id: "pro-long-lived-checkout",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
			actions: [],
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			long_lived_checkout: true,
		});

		expect(result.payment_url).toContain("/co/");
		expect(result.payment_url).not.toContain("checkout.stripe.com");

		const checkoutId = getLongLivedCheckoutId(result.payment_url);
		await expectLongLivedCheckoutExpiry({ ctx, checkoutId });

		const stripeUrl = await startLongLivedCheckout(checkoutId);
		const stripeSessionId = getStripeSessionId(stripeUrl);
		await expectStoredPaymentUrl({ ctx, checkoutId, paymentUrl: stripeUrl });

		const reusedStripeUrl = await startLongLivedCheckout(checkoutId);
		expect(getStripeSessionId(reusedStripeUrl)).toBe(stripeSessionId);
		await expectStoredPaymentUrl({
			ctx,
			checkoutId,
			paymentUrl: reusedStripeUrl,
		});

		await ctx.stripeCli.checkout.sessions.expire(stripeSessionId);
		const freshStripeUrl = await startLongLivedCheckout(checkoutId);
		expect(getStripeSessionId(freshStripeUrl)).not.toBe(stripeSessionId);
		await expectStoredPaymentUrl({
			ctx,
			checkoutId,
			paymentUrl: freshStripeUrl,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout: normal attach still returns Stripe checkout")}`,
	async () => {
		const customerId = "long-lived-checkout-regression";
		const pro = products.pro({
			id: "pro-long-lived-regression",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
			actions: [],
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
		});

		expect(result.payment_url).toContain("checkout.stripe.com");
		expect(result.payment_url).not.toContain("/co/");
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout: creating the link leaves the plan pending before it is opened")}`,
	async () => {
		const customerId = "ll-deferred-pending-on-create";
		const { ctx, pro, internalCustomerId, checkoutId } =
			await setupDeferredLongLivedScenario({ customerId });

		const pendingAtCreation = await getPendingProRow({
			ctx,
			internalCustomerId,
			productId: pro.id,
		});
		expect(pendingAtCreation).toBeDefined();

		await startLongLivedCheckout(checkoutId);
		const pendingAfterOpen = await getPendingProRow({
			ctx,
			internalCustomerId,
			productId: pro.id,
		});
		expect(pendingAfterOpen?.id).toBe(pendingAtCreation!.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout: pending plan survives Stripe session expiry and reopening renews it")}`,
	async () => {
		const customerId = "ll-deferred-expiry";
		const { ctx, pro, internalCustomerId, checkoutId } =
			await setupDeferredLongLivedScenario({ customerId });

		const firstSessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		const pendingAtOpen = await getPendingProRow({
			ctx,
			internalCustomerId,
			productId: pro.id,
		});
		expect(pendingAtOpen).toBeDefined();

		await ctx.stripeCli.checkout.sessions.expire(firstSessionId);
		await expect(
			waitForStripeWebhook({
				stripeCli: ctx.stripeCli,
				env: ctx.env,
				types: ["checkout.session.expired"],
				objectId: firstSessionId,
				until: async () =>
					!(await getPendingProRow({
						ctx,
						internalCustomerId,
						productId: pro.id,
					})),
				replayAfterMs: 5_000,
				timeoutMs: 15_000,
			}),
		).rejects.toThrow(DELIVERED_WITHOUT_EFFECT);

		const secondSessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		expect(secondSessionId).not.toBe(firstSessionId);

		const pendingAfterReopen = await getPendingProRow({
			ctx,
			internalCustomerId,
			productId: pro.id,
		});
		expect(pendingAfterReopen?.id).toBe(pendingAtOpen!.id);

		const pendingMetadata = await ctx.db.query.metadata.findFirst({
			where: eq(metadata.id, pendingAfterReopen!.metadata_id!),
		});
		expect(pendingMetadata?.stripe_checkout_session_id).toBe(secondSessionId);
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout: paying a renewed session promotes the pending plan")}`,
	async () => {
		const customerId = "ll-deferred-renewed-paid";
		const { ctx, pro, internalCustomerId, checkoutId } =
			await setupDeferredLongLivedScenario({ customerId });

		const firstSessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		const pendingRow = await getPendingProRow({
			ctx,
			internalCustomerId,
			productId: pro.id,
		});
		await ctx.stripeCli.checkout.sessions.expire(firstSessionId);

		const renewedUrl = await startLongLivedCheckout(checkoutId);
		await completeStripeCheckoutForm({ url: renewedUrl });

		await waitForStripeWebhook({
			stripeCli: ctx.stripeCli,
			env: ctx.env,
			types: ["checkout.session.completed"],
			objectId: getStripeSessionId(renewedUrl),
			until: async () => {
				const rows = await CusProductService.list({
					db: ctx.db,
					internalCustomerId,
					inStatuses: [CusProductStatus.Active],
				});
				return rows.some((row) => row.id === pendingRow!.id);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout: cron expires the pending plan after link expiry")}`,
	async () => {
		const customerId = "ll-deferred-cron";
		const { ctx, pro, internalCustomerId, checkoutId } =
			await setupDeferredLongLivedScenario({ customerId });

		await startLongLivedCheckout(checkoutId);
		const pendingRow = await getPendingProRow({
			ctx,
			internalCustomerId,
			productId: pro.id,
		});
		const metadataId = pendingRow!.metadata_id!;

		await runLongLivedCheckoutExpiry({ ctx });
		expect(
			await getPendingProRow({ ctx, internalCustomerId, productId: pro.id }),
		).toBeDefined();

		await ctx.db
			.update(metadata)
			.set({ expires_at: Date.now() - 1000 })
			.where(eq(metadata.id, metadataId));
		await runLongLivedCheckoutExpiry({ ctx });

		expect(
			await getPendingProRow({ ctx, internalCustomerId, productId: pro.id }),
		).toBeUndefined();
		expect(
			await ctx.db.query.metadata.findFirst({
				where: eq(metadata.id, metadataId),
			}),
		).toBeUndefined();
	},
);
