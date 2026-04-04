/**
 * Sync Tier Tests
 *
 * Tests the Stripe → Autumn sync proposal metadata for different pricing
 * models: tiered (graduated), volume-based, and usage-based (metered).
 *
 * Each test creates a product with the specific pricing type, builds a
 * real Stripe subscription from it, then fetches sync proposals and
 * verifies the price metadata (billing_scheme, tiers_mode,
 * recurring_usage_type, unit_amount, etc.) is surfaced correctly.
 *
 * Test A: Tiered (graduated) pricing — prepaid messages with graduated tiers.
 * Test B: Volume-based pricing — prepaid messages with volume tiers.
 * Test C: Usage-based (metered) pricing — consumable messages billed per use.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type {
	SyncProposal,
	SyncProposalItem,
	SyncProposalsResponse,
} from "@/internal/billing/v2/actions/sync/syncProposals";
import { createStripeSubscriptionFromProduct } from "./utils/syncTestUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST A: Tiered (graduated) pricing
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("sync-tiers: tiered graduated pricing proposals")}`, async () => {
	const customerId = "sync-tier-graduated";

	const tieredMessages = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		tiers: [
			{ to: 500, amount: 10 },
			{ to: "inf", amount: 5 },
		],
	});
	const pro = products.pro({
		id: "pro-tiered",
		items: [tieredMessages],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const stripeSubscription = await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(stripeSubscription.id).toBeDefined();
	expect(stripeSubscription.status).toBe("active");

	const proposalsResponse: SyncProposalsResponse = await autumnV1.post(
		"/billing.sync_proposals",
		{ customer_id: customerId },
	);

	expect(proposalsResponse.proposals.length).toBeGreaterThanOrEqual(1);

	const matchedProposal = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSubscription.id,
	);
	expect(matchedProposal).toBeDefined();

	const tieredItem = matchedProposal!.items.find(
		(item: SyncProposalItem) => item.billing_scheme === "tiered",
	);
	expect(tieredItem).toBeDefined();
	expect(tieredItem!.billing_scheme).toBe("tiered");
	expect(tieredItem!.tiers_mode).toBe("graduated");
	expect(tieredItem!.currency).toBeTruthy();

	if (tieredItem!.tiers && tieredItem!.tiers.length > 0) {
		expect(tieredItem!.tiers.length).toBeGreaterThanOrEqual(2);
		for (const tier of tieredItem!.tiers) {
			expect(tier.unit_amount !== null || tier.flat_amount !== null).toBe(true);
		}
	}

	await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST B: Volume-based pricing
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("sync-tiers: volume-based pricing proposals")}`, async () => {
	const customerId = "sync-tier-volume";

	const volumeMessages = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		tiers: [
			{ to: 500, amount: 10 },
			{ to: "inf", amount: 5 },
		],
	});
	const pro = products.pro({
		id: "pro-volume",
		items: [volumeMessages],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const stripeSubscription = await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(stripeSubscription.id).toBeDefined();
	expect(stripeSubscription.status).toBe("active");

	const proposalsResponse: SyncProposalsResponse = await autumnV1.post(
		"/billing.sync_proposals",
		{ customer_id: customerId },
	);

	expect(proposalsResponse.proposals.length).toBeGreaterThanOrEqual(1);

	const matchedProposal = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSubscription.id,
	);
	expect(matchedProposal).toBeDefined();

	const volumeItem = matchedProposal!.items.find(
		(item: SyncProposalItem) => item.tiers_mode === "volume",
	);
	expect(volumeItem).toBeDefined();
	expect(volumeItem!.billing_scheme).toBe("tiered");
	expect(volumeItem!.tiers_mode).toBe("volume");
	expect(volumeItem!.currency).toBeTruthy();

	if (volumeItem!.tiers && volumeItem!.tiers.length > 0) {
		expect(volumeItem!.tiers.length).toBeGreaterThanOrEqual(2);
		for (const tier of volumeItem!.tiers) {
			expect(tier.unit_amount !== null || tier.flat_amount !== null).toBe(true);
		}
	}

	await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST C: Usage-based (metered) pricing
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("sync-tiers: metered usage-based pricing proposals")}`, async () => {
	const customerId = "sync-tier-metered";

	const meteredMessages = items.consumableMessages({
		includedUsage: 0,
		price: 0.1,
	});
	const pro = products.pro({
		id: "pro-metered",
		items: [meteredMessages],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const stripeSubscription = await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(stripeSubscription.id).toBeDefined();
	expect(stripeSubscription.status).toBe("active");

	const proposalsResponse: SyncProposalsResponse = await autumnV1.post(
		"/billing.sync_proposals",
		{ customer_id: customerId },
	);

	expect(proposalsResponse.proposals.length).toBeGreaterThanOrEqual(1);

	const matchedProposal = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSubscription.id,
	);
	expect(matchedProposal).toBeDefined();

	const meteredItem = matchedProposal!.items.find(
		(item: SyncProposalItem) => item.recurring_usage_type === "metered",
	);
	expect(meteredItem).toBeDefined();
	expect(meteredItem!.recurring_usage_type).toBe("metered");
	expect(meteredItem!.currency).toBeTruthy();

	if (meteredItem!.unit_amount !== null) {
		expect(meteredItem!.unit_amount).toBeGreaterThan(0);
	}

	await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
});
