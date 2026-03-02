import { expect, test } from "bun:test";

import { OnDecrease, OnIncrease, type TrackResponseV2 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectFeatureCachedAndDb } from "@tests/integration/billing/utils/expectFeatureCachedAndDb.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";

// ═══════════════════════════════════════════════════════════════════
// Allocated Invoice — Stale Update Prevention Tests
//
// These tests verify that the allocated invoice flow does NOT corrupt
// unrelated subscription state. When tracking into overage creates
// an invoice, it must not accidentally undo cancellations, downgrades,
// or schedule changes on other products/entities.
// ═══════════════════════════════════════════════════════════════════

const PRICE_PER_SEAT = 50;
const INCLUDED_USAGE = 1;

const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: PRICE_PER_SEAT,
	includedUsage: INCLUDED_USAGE,
	config: {
		on_increase: OnIncrease.BillImmediately,
		on_decrease: OnDecrease.None,
	},
});

// ═══════════════════════════════════════════════════════════════════
// adv1: Cancel add-on, then track allocated users into overage
//
// Setup: Attach pro (with allocated users) + recurring add-on.
//        Cancel the add-on.
// Action: Track users into overage (creates an invoice).
// Assert: The add-on subscription is still canceling.
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("allocated-invoice-adv1: tracking overage does not undo add-on cancellation")}`, async () => {
	const pro = products.pro({ id: "pro", items: [userItem] });
	const addOn = products.recurringAddOn({ id: "addon", items: [] });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "allocated-invoice-adv1",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addOn.id }),
			s.cancel({ productId: addOn.id }),
		],
	});

	// Verify add-on is canceling before tracking
	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});

	// Track into overage — creates a BillImmediately invoice
	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 1,
		purchased_balance: 1,
		current_balance: 0,
		usage: 2,
	});

	await expectFeatureCachedAndDb({
		autumn: autumnV1,
		customerId,
		featureId: TestFeature.Users,
		balance: -1,
		usage: 2,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: PRICE_PER_SEAT * 1,
		latestStatus: "paid",
	});

	const customerAfter = await autumnV1.customers.get(customerId);

	await expectCustomerProducts({
		customer: customerAfter,
		active: [pro.id],
		canceling: [addOn.id],
	});

	// The add-on subscription must still be canceling
	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});

// ═══════════════════════════════════════════════════════════════════
// adv2: Downgrade entity 1, then track entity 2 into overage
//
// Setup: 2 entities, both attached to premium (with allocated workflows).
//        Downgrade entity 1 from premium to pro (scheduled).
// Action: Track entity 2 workflows into overage.
// Assert: Entity 1's subscription is still scheduled to downgrade.
// ═══════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("allocated-invoice-adv2: tracking entity overage does not undo another entity's scheduled downgrade")}`, async () => {
	const workflowItem = constructArrearProratedItem({
		featureId: TestFeature.Workflows,
		pricePerUnit: PRICE_PER_SEAT,
		includedUsage: INCLUDED_USAGE,
		config: {
			on_increase: OnIncrease.BillImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const premium = products.premium({
		id: "premium",
		items: [workflowItem],
	});
	const pro = products.pro({ id: "pro", items: [workflowItem] });

	const { customerId, autumnV1, autumnV2, entities } = await initScenario({
		customerId: "allocated-invoice-adv2",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, entityIndex: 0 }),
			s.billing.attach({ productId: premium.id, entityIndex: 1 }),
			// Downgrade entity 1 from premium to pro (scheduled for end of cycle)
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
		],
	});

	// Verify entity 1 has a scheduled downgrade before tracking
	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});

	// Track entity 2 workflows into overage
	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Workflows,
		entity_id: entities[1].id,
		value: 2,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 1,
		purchased_balance: 1,
		current_balance: 0,
		usage: 2,
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);

	await expectCustomerProducts({
		customer: entity1,
		canceling: [premium.id],
		scheduled: [pro.id],
	});

	// Entity 1's scheduled downgrade must still be intact
	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});
