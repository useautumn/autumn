/**
 * Scheduled Switch Entities — Prepaid Messages
 *
 * Tests that scheduled downgrades work correctly with entity-scoped prepaid
 * products. Each entity gets independent inline prices in Stripe, and the
 * subscription schedule must preserve per-entity pricing through the transition.
 *
 * Products use prepaid messages (100 included, $10/100 units).
 * Quantity in billing.attach is INCLUSIVE of included usage.
 *
 * Price math (BILLING_UNITS=100, PRICE_PER_UNIT=$10, INCLUDED_USAGE=100):
 *   quantity 500 → (500-100)/100 * $10 = $40 prepaid + base price
 *   quantity 300 → (300-100)/100 * $10 = $20 prepaid + base price
 */

import { test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const PRICE_PER_UNIT = 10;
const INCLUDED_USAGE = 100;

const PRO_BASE = 20;
const PREMIUM_BASE = 50;

/** Prepaid cost for a given quantity: (qty - included) / billingUnits * price */
const prepaidCost = (quantity: number) =>
	((quantity - INCLUDED_USAGE) / BILLING_UNITS) * PRICE_PER_UNIT;

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Single entity premium → pro downgrade + advance cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Both entities start on premium ($50/mo) with 500 prepaid messages.
 * Downgrade entity 1 to pro ($20/mo) with 300 messages.
 *
 * Expected:
 *   Entity 1: premium canceling + pro scheduled, balance still 500 (until cycle ends)
 *   Entity 2: premium active, balance 500
 *   Stripe schedule reflects the scheduled downgrade with inline prepaid prices
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-entities-prepaid 1: single entity premium→pro downgrade + advance cycle")}`, async () => {
	const customerId = "sched-prepaid-ent-pre-cycle";
	const premiumQuantity = 500;
	const proQuantity = 300;

	const prepaidItem = items.prepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
	});

	const premium = products.premium({
		id: "premium-prepaid",
		items: [prepaidItem],
	});
	const pro = products.pro({
		id: "pro-prepaid",
		items: [prepaidItem],
	});

	const { autumnV1, entities, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
				],
			}),
		],
	});

	// Action under test: downgrade entity 1 to pro (scheduled)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: proQuantity }],
		redirect_mode: "if_required",
	});

	// Verify entity 1: premium canceling, pro scheduled
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({ customer: entity1, productId: premium.id });
	await expectProductScheduled({ customer: entity1, productId: pro.id });

	// Balances unchanged before cycle ends
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: premiumQuantity,
		usage: 0,
	});

	// Stripe schedule should reflect the downgrade
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfter,
		active: [pro.id],
		notPresent: [premium.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		balance: proQuantity,
		usage: 0,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	// Invoices:
	//   0 (latest): renewal — pro base ($20) + prepaid 300 ($20) = $40
	//   1: initial — premium base ($50) + prepaid 500 ($40) = $90
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: PRO_BASE + prepaidCost(proQuantity),
	});
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		invoiceIndex: 1,
		latestTotal: PREMIUM_BASE + prepaidCost(premiumQuantity),
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity 1 premium → pro, entity 2 stays premium → advance cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Both entities on premium with 500 messages. Downgrade entity 1 to pro with 300.
 * After cycle: entity 1 on pro with 300 balance, entity 2 renewed on premium with 500 balance.
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-entities-prepaid 2: entity 1 premium→pro, entity 2 stays premium, advance cycle")}`, async () => {
	const customerId = "sched-prepaid-ent-post-cycle";
	const premiumQuantity = 500;
	const proQuantity = 300;

	const prepaidItem = items.prepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
	});

	const premium = products.premium({
		id: "premium-prepaid",
		items: [prepaidItem],
	});
	const pro = products.pro({
		id: "pro-prepaid",
		items: [prepaidItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
				],
			}),
			s.billing.attach({
				productId: premium.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
				],
			}),
			s.billing.attach({
				productId: pro.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Messages, quantity: proQuantity }],
			}),
			s.advanceToNextInvoice(),
		],
	});

	// After cycle: entity 1 on pro, entity 2 on premium
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	await expectCustomerProducts({
		customer: entity1,
		active: [pro.id],
		notPresent: [premium.id],
	});
	await expectCustomerProducts({
		customer: entity2,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Entity 1 gets pro quantity, entity 2 keeps premium quantity
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: proQuantity,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: premiumQuantity,
		usage: 0,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });

	// Invoices:
	//   0 (latest): renewal — entity 1 pro ($20+$20) + entity 2 premium ($50+$40) = $130
	//   1: initial — entity 2 premium ($50+$40) = $90
	//   2: initial — entity 1 premium ($50+$40) = $90
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal:
			PRO_BASE +
			prepaidCost(proQuantity) +
			PREMIUM_BASE +
			prepaidCost(premiumQuantity),
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Both entities premium → pro → advance cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Both entities on premium with 500 messages. Downgrade both to pro with 300.
 * After cycle: both on pro with 300 balance.
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-entities-prepaid 3: both entities premium→pro, advance cycle")}`, async () => {
	const customerId = "sched-prepaid-ent-both-down";
	const premiumQuantity = 500;
	const proQuantity = 300;

	const prepaidItem = items.prepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
	});

	const premium = products.premium({
		id: "premium-prepaid",
		items: [prepaidItem],
	});
	const pro = products.pro({
		id: "pro-prepaid",
		items: [prepaidItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
				],
			}),
			s.billing.attach({
				productId: premium.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: premiumQuantity },
				],
			}),
			s.billing.attach({
				productId: pro.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Messages, quantity: proQuantity }],
			}),
			s.billing.attach({
				productId: pro.id,
				entityIndex: 1,
				options: [{ feature_id: TestFeature.Messages, quantity: proQuantity }],
			}),
			s.advanceToNextInvoice(),
		],
	});

	// After cycle: both on pro
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	await expectCustomerProducts({
		customer: entity1,
		active: [pro.id],
		notPresent: [premium.id],
	});
	await expectCustomerProducts({
		customer: entity2,
		active: [pro.id],
		notPresent: [premium.id],
	});

	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: proQuantity,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: proQuantity,
		usage: 0,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });

	// Invoices:
	//   0 (latest): renewal — entity 1 pro ($20+$20) + entity 2 pro ($20+$20) = $80
	//   1: initial — entity 2 premium ($50+$40) = $90
	//   2: initial — entity 1 premium ($50+$40) = $90
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 2 * (PRO_BASE + prepaidCost(proQuantity)),
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Entity 1 pro → free (scheduled), entity 2 pro → premium (immediate)
//         → advance cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Both entities on pro ($20/mo) with 300 prepaid messages.
 * Entity 1 downgrades to free (scheduled).
 * Entity 2 upgrades to premium (immediate).
 *
 * Pre-cycle:
 *   Entity 1: pro canceling + free scheduled
 *   Entity 2: premium active with 500 balance
 *
 * Post-cycle:
 *   Entity 1: free active with 200 balance
 *   Entity 2: premium active with 500 balance (renewed)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-entities-prepaid 4: entity 1 pro→free, entity 2 pro→premium, advance cycle")}`, async () => {
	const customerId = "sched-prepaid-ent-cross";
	const proQuantity = 300;
	const freeQuantity = 200;
	const premiumQuantity = 500;

	const prepaidItem = items.prepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
	});

	const free = products.base({
		id: "free-prepaid",
		items: [prepaidItem],
	});
	const pro = products.pro({
		id: "pro-prepaid",
		items: [prepaidItem],
	});
	const premium = products.premium({
		id: "premium-prepaid",
		items: [prepaidItem],
	});

	const { autumnV1, entities, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Messages, quantity: proQuantity }],
			}),
			s.billing.attach({
				productId: pro.id,
				entityIndex: 1,
				options: [{ feature_id: TestFeature.Messages, quantity: proQuantity }],
			}),
		],
	});

	// Action under test: downgrade entity 1, upgrade entity 2
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: freeQuantity }],
		redirect_mode: "if_required",
	});
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity: premiumQuantity }],
		redirect_mode: "if_required",
	});

	// ── Pre-cycle checks ──

	// Entity 1: pro canceling, free scheduled
	const preCycleEntity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: preCycleEntity1,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: preCycleEntity1,
		productId: free.id,
	});

	// Entity 2: premium active (immediate upgrade)
	const preCycleEntity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectCustomerProducts({
		customer: preCycleEntity2,
		active: [premium.id],
		notPresent: [pro.id],
	});
	expectCustomerFeatureCorrect({
		customer: preCycleEntity2,
		featureId: TestFeature.Messages,
		balance: premiumQuantity,
		usage: 0,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });

	// ── Advance cycle ──

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// ── Post-cycle checks ──

	const postCycleEntity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const postCycleEntity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	await expectCustomerProducts({
		customer: postCycleEntity1,
		active: [free.id],
		notPresent: [pro.id, premium.id],
	});
	await expectCustomerProducts({
		customer: postCycleEntity2,
		active: [premium.id],
		notPresent: [pro.id, free.id],
	});

	expectCustomerFeatureCorrect({
		customer: postCycleEntity1,
		featureId: TestFeature.Messages,
		balance: freeQuantity,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer: postCycleEntity2,
		featureId: TestFeature.Messages,
		balance: premiumQuantity,
		usage: 0,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });

	// Invoices (post-cycle):
	//   0 (latest): renewal — entity 1 free ($0 + prepaid $10) + entity 2 premium ($50+$40) = $100
	//   + proration invoice from entity 2's immediate pro→premium upgrade
	//   + 2 initial pro attaches
	// Just check the latest renewal total
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 4,
		latestTotal:
			prepaidCost(freeQuantity) + PREMIUM_BASE + prepaidCost(premiumQuantity),
	});
});
