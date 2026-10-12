/**
 * A finalized invoice can carry a usage line written before line ids were
 * invoice-scoped. On the first retry after per-band billing ships, usage that
 * now splits into two bands must reconcile against that one legacy line as the
 * price's whole set: carry the net delta once and still reset balances.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { hoursToFinalizeInvoice } from "@tests/utils/constants";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { handleStripeInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/handleStripeInvoiceCreated";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

// $0.10 up to 100 messages, $0.05 after; nothing included.
const TIERS = [
	{ to: 100, amount: 0.1 },
	{ to: "inf" as const, amount: 0.05 },
];
const FIRST_RUN_MESSAGES = 50;
const EXTRA_MESSAGES_AFTER_FINALIZE = 80;
const LEGACY_LINE_ID = "invoice_li_legacy_unscoped";

const listAutumnLines = async ({
	stripeCli,
	invoiceId,
}: {
	stripeCli: Stripe;
	invoiceId: string;
}) => {
	const lines: Stripe.InvoiceLineItem[] = [];
	for await (const line of stripeCli.invoices.listLineItems(invoiceId, {
		limit: 100,
	})) {
		if (line.metadata?.autumn_line_item_id) lines.push(line);
	}
	return lines;
};

const getMessagesEntitlement = async ({
	ctx,
	customerId,
}: {
	ctx: Parameters<typeof CusService.getFull>[0]["ctx"];
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerEntitlement = fullCustomer.customer_products
		.flatMap((customerProduct) => customerProduct.customer_entitlements)
		.find((entitlement) => entitlement.feature_id === TestFeature.Messages);
	if (!customerEntitlement) throw new Error("Messages entitlement not found");
	return { fullCustomer, customerEntitlement };
};

test.concurrent(
	`${chalk.yellowBright("invoice.created retry: a finalized legacy usage line that now splits into bands carries the net delta once")}`,
	async () => {
		const customerId = "inv-created-retry-legacy-tier-split";
		const pro = products.pro({
			id: "pro",
			items: [items.tieredConsumableMessages({ tiers: TIERS })],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Messages, value: FIRST_RUN_MESSAGES }),
			],
		});
		if (!testClockId) throw new Error("Scenario did not create a test clock");
		const { customerEntitlement: entitlementBeforeCycle } =
			await getMessagesEntitlement({ ctx, customerId });

		const cycleBoundaryMs = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			numberOfMonths: 1,
			waitForSeconds: 60,
		});

		const { fullCustomer } = await getMessagesEntitlement({ ctx, customerId });
		const stripeCustomerId =
			fullCustomer.processor?.id || fullCustomer.processor?.processor_id;
		if (!stripeCustomerId) throw new Error("Missing Stripe customer ID");
		const invoices = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId,
			limit: 10,
		});
		const cycleInvoice = invoices.data.find(
			(invoice) => invoice.billing_reason === "subscription_cycle",
		);
		if (!cycleInvoice) throw new Error("No subscription_cycle invoice found");
		expect(cycleInvoice.status).toBe("draft");

		// ── One band billed; rewrite its id to the pre-scoped shape older invoices carry ──
		const [usageLine, ...otherUsageLines] = (
			await listAutumnLines({
				stripeCli: ctx.stripeCli,
				invoiceId: cycleInvoice.id,
			})
		).filter((line) =>
			line.metadata?.autumn_line_item_id?.startsWith("invoice_li_usage_"),
		);
		expect(otherUsageLines).toHaveLength(0);
		if (!usageLine) throw new Error("No usage line on the cycle invoice");
		const scopedUsageLineId = usageLine.metadata!.autumn_line_item_id!;
		expect(usageLine.amount).toBe(FIRST_RUN_MESSAGES * 10);
		await ctx.stripeCli.invoices.updateLineItem(cycleInvoice.id, usageLine.id, {
			metadata: { autumn_line_item_id: LEGACY_LINE_ID },
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			startingFrom: new Date(cycleBoundaryMs),
			numberOfHours: hoursToFinalizeInvoice,
			waitForSeconds: 30,
		});
		const finalizedInvoice = await ctx.stripeCli.invoices.retrieve(
			cycleInvoice.id,
		);
		expect(finalizedInvoice.status).toBe("paid");

		// ── Crash before the reset, then usage crosses into the second band ──
		await CusEntService.update({
			ctx,
			id: entitlementBeforeCycle.id,
			updates: {
				balance: -FIRST_RUN_MESSAGES,
				next_reset_at: entitlementBeforeCycle.next_reset_at ?? undefined,
			},
		});
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "invoice-created-legacy-split-test-rollback",
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: EXTRA_MESSAGES_AFTER_FINALIZE,
		});
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "invoice-created-legacy-split-test-flush",
			flushBalances: true,
		});

		const { fullCustomer: customerBeforeReplay } = await getMessagesEntitlement(
			{ ctx, customerId },
		);
		const stripeEvent = {
			id: `evt_replay_${cycleInvoice.id}`,
			object: "event",
			api_version: null,
			created: Math.floor(Date.now() / 1000),
			data: { object: finalizedInvoice },
			livemode: false,
			pending_webhooks: 0,
			request: null,
			type: "invoice.created",
		} as Stripe.InvoiceCreatedEvent;

		await handleStripeInvoiceCreated({
			ctx: {
				...ctx,
				fullCustomer: customerBeforeReplay,
				stripeEvent,
			} satisfies StripeWebhookContext,
			event: stripeEvent,
		});

		// 130 messages: 100 × $0.10 + 30 × $0.05 = $11.50, against $5.00 billed.
		const pendingItems = await ctx.stripeCli.invoiceItems.list({
			customer: stripeCustomerId,
			pending: true,
			limit: 100,
		});
		const carryItems = pendingItems.data.filter((item) =>
			item.metadata?.autumn_line_item_id?.endsWith("_carry"),
		);
		expect(
			carryItems.map((item) => ({
				id: item.metadata?.autumn_line_item_id,
				amount: item.amount,
			})),
		).toEqual([{ id: `${scopedUsageLineId}_carry`, amount: 650 }]);

		const invoiceAfterReplay = await ctx.stripeCli.invoices.retrieve(
			cycleInvoice.id,
		);
		expect(invoiceAfterReplay.total).toBe(finalizedInvoice.total);

		const { customerEntitlement: entitlementAfterReplay } =
			await getMessagesEntitlement({ ctx, customerId });
		expect(entitlementAfterReplay.next_reset_at).toBeGreaterThan(
			entitlementBeforeCycle.next_reset_at ?? 0,
		);
		expectCustomerFeatureCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			featureId: TestFeature.Messages,
			balance: 0,
		});
	},
);
