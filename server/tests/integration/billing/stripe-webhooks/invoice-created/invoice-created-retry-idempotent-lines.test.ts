/**
 * TDD test for invoice.created being safe to replay after a mid-handler crash.
 *
 * Incident (Surge sandbox, 2026-09-14): the handler crashed on a Stripe 429
 * after some lines had landed, Stripe retried the event, and the retry added
 * the usage lines a second time (random idempotency keys, no existing-line
 * check). A later retry against the finalized invoice threw
 * invoice_not_editable, so the balance resets never ran either.
 *
 * The incident state is reproduced by letting the real webhook run (lines
 * added, balances reset), then rolling the customer entitlement back to its
 * pre-reset state, which is exactly what a crash between "lines added" and
 * "balances reset" leaves behind. Replaying the handler from that state must
 * recover: no new Stripe lines, same total, balances reset.
 *
 * Red-failure mode (current behavior):
 *  - usage line ids are random per run, so the replay cannot see its own
 *    lines and either duplicates the usage line or throws
 *    "This invoice is no longer editable"
 *
 * Green-success criteria (after fix):
 *  - the cycle invoice carries one usage line whose Autumn id is scoped to it
 *  - the replay adds nothing to Stripe and completes the balance reset
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { handleStripeInvoiceCreated } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/handleStripeInvoiceCreated";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

const INCLUDED_MESSAGES = 100;
const TRACKED_MESSAGES = 250;
const OVERAGE = TRACKED_MESSAGES - INCLUDED_MESSAGES;

const listAutumnLineIds = async ({
	stripeCli,
	invoiceId,
}: {
	stripeCli: Stripe;
	invoiceId: string;
}) => {
	const lineIds: string[] = [];
	for await (const line of stripeCli.invoices.listLineItems(invoiceId, {
		limit: 100,
	})) {
		const autumnLineItemId = line.metadata?.autumn_line_item_id;
		if (autumnLineItemId) lineIds.push(autumnLineItemId);
	}
	return lineIds.sort();
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
	`${chalk.yellowBright("invoice.created retry: replay after a crash between line creation and balance reset adds no lines and completes the reset")}`,
	async () => {
		const customerId = "inv-created-retry-idempotent-lines";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: INCLUDED_MESSAGES })],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Messages, value: TRACKED_MESSAGES }),
			],
		});

		// Balances live in Redis until a flush; assert usage through the API.
		const customerBeforeCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerBeforeCycle,
			featureId: TestFeature.Messages,
			balance: -OVERAGE,
		});
		const { customerEntitlement: entitlementBeforeCycle } =
			await getMessagesEntitlement({ ctx, customerId });

		if (!testClockId) throw new Error("Scenario did not create a test clock");
		// Pause at the cycle boundary so invoice.created runs on a draft, as in
		// production, then advance again so Stripe finalizes and pays it.
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			withPause: true,
		});

		const { fullCustomer: customerAfterCycle } = await getMessagesEntitlement({
			ctx,
			customerId,
		});
		const stripeCustomerId =
			customerAfterCycle.processor?.id ||
			customerAfterCycle.processor?.processor_id;
		if (!stripeCustomerId) throw new Error("Missing Stripe customer ID");

		const invoices = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId,
			limit: 10,
		});
		const cycleInvoice = invoices.data.find(
			(invoice) => invoice.billing_reason === "subscription_cycle",
		);
		if (!cycleInvoice) throw new Error("No subscription_cycle invoice found");

		// ── Real run: one usage line, id scoped to this invoice ──
		const lineIdsAfterFirstRun = await listAutumnLineIds({
			stripeCli: ctx.stripeCli,
			invoiceId: cycleInvoice.id,
		});
		const usageLineIds = lineIdsAfterFirstRun.filter((lineId) =>
			lineId.startsWith("invoice_li_usage_"),
		);
		expect(usageLineIds).toHaveLength(1);
		expect(usageLineIds[0]).toContain(cycleInvoice.id);

		// ── Recreate the incident: lines landed, but the reset never ran ──
		await CusEntService.update({
			ctx,
			id: entitlementBeforeCycle.id,
			updates: {
				balance: -OVERAGE,
				next_reset_at: entitlementBeforeCycle.next_reset_at ?? undefined,
			},
		});
		// Postgres was written directly, so drop the cache without flushing it back.
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "invoice-created-retry-test-rollback",
		});

		const { fullCustomer: customerBeforeReplay } = await getMessagesEntitlement(
			{ ctx, customerId },
		);
		const stripeEvent = {
			id: `evt_replay_${cycleInvoice.id}`,
			object: "event",
			api_version: null,
			created: Math.floor(Date.now() / 1000),
			data: { object: cycleInvoice },
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

		// ── Stripe untouched, balances recovered ──
		const lineIdsAfterReplay = await listAutumnLineIds({
			stripeCli: ctx.stripeCli,
			invoiceId: cycleInvoice.id,
		});
		expect(lineIdsAfterReplay).toEqual(lineIdsAfterFirstRun);

		const invoiceAfterReplay = await ctx.stripeCli.invoices.retrieve(
			cycleInvoice.id,
		);
		expect(invoiceAfterReplay.total).toBe(cycleInvoice.total);

		const { customerEntitlement: entitlementAfterReplay } =
			await getMessagesEntitlement({ ctx, customerId });
		expect(entitlementAfterReplay.next_reset_at).toBeGreaterThan(
			entitlementBeforeCycle.next_reset_at ?? 0,
		);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: INCLUDED_MESSAGES,
		});
		expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: cycleInvoice.total / 100,
			latestInvoiceProductId: pro.id,
		});
	},
);
