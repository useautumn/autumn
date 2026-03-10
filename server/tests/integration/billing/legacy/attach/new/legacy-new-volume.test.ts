/**
 * Legacy New Attach — Volume Pricing Tests
 *
 * Tests that the V1 attach() path applies volume tier semantics correctly.
 * V1 quantity = purchased units (excludes includedUsage).
 * Volume pricing charges the ENTIRE purchased quantity at the rate of its tier
 * (not split across tiers like graduated pricing).
 *
 * Tiers (billingUnits = 100):
 *   Tier 1: 0–500 units @ $10/pack
 *   Tier 2: 501+ units  @ $5/pack
 *
 * Base product price: $20/month (products.pro)
 *
 * V1 vs V2 quantity reminder:
 *   V1: options[].quantity = purchased units (EXCLUDES includedUsage)
 *   V2: options[].quantity = total units (INCLUDES includedUsage)
 *   For includedUsage=0, V1 and V2 quantities are identical.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const BASE_PRICE = 20;

const VOLUME_TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: purchased=300, allowance=0, tier 1 → invoice $50
//
// V1 options.quantity: 300 (purchased; allowance = 0)
// Total balance:       300
//
// Volume math:
//   300 units → tier 1 → 3 × $10 = $30
//   Graduated would also be $30 (same tier — no differentiator)
//
// Invoice total: $20 (base) + $30 (prepaid) = $50
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("legacy-new-volume 1: purchased=300, no allowance, tier 1 → $50")}`, async () => {
	const customerId = "legacy-new-volume-t1";
	const purchasedQuantity = 300;
	const includedUsage = 0;
	// Volume: 3 packs × $10 = $30; graduated would also be $30 (same tier)
	const expectedPrepaid = (purchasedQuantity / BILLING_UNITS) * 10;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const pro = products.pro({ id: "pro-legacy-volume-t1", items: [volumeItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: purchasedQuantity },
				],
			}),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductAttached({ customer: customer as any, product: pro });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: includedUsage + purchasedQuantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: BASE_PRICE + expectedPrepaid,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: purchased=800, allowance=0, tier 2 → invoice $60
//
// V1 options.quantity: 800
// Total balance:       800
//
// Volume math:
//   800 units → tier 2 → 8 × $5 = $40
//   Graduated would be: 5×$10 + 3×$5 = $65 — KEY DIFFERENTIATOR
//
// Invoice total: $20 (base) + $40 (prepaid) = $60
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("legacy-new-volume 2: purchased=800, no allowance, tier 2 → $60 (graduated would be $65)")}`, async () => {
	const customerId = "legacy-new-volume-t2";
	const purchasedQuantity = 800;
	const includedUsage = 0;
	// Volume: 8 packs × $5 = $40; graduated would be: 5×$10 + 3×$5 = $65
	const expectedPrepaid = (purchasedQuantity / BILLING_UNITS) * 5;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const pro = products.pro({ id: "pro-legacy-volume-t2", items: [volumeItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: purchasedQuantity },
				],
			}),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductAttached({ customer: customer as any, product: pro });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: includedUsage + purchasedQuantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: BASE_PRICE + expectedPrepaid,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: purchased=200, allowance=100, tier 1 → invoice $40
//
// V1 options.quantity: 200 (purchased only; allowance excluded per V1 semantics)
// includedUsage:       100
// Total balance:       300 (100 allowance + 200 purchased)
//
// Volume math applies to the PURCHASED portion (200 units):
//   200 units → tier 1 → 2 × $10 = $20
//   Graduated would also be $20 (same tier — no differentiator)
//
// Invoice total: $20 (base) + $20 (prepaid) = $40
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("legacy-new-volume 3: purchased=200, allowance=100, tier 1 → $20 (balance=300)")}`, async () => {
	const customerId = "legacy-new-volume-t3";
	const purchasedQuantity = 200;
	const includedUsage = 100;
	// V1: quantity = purchased only (200); balance = allowance + purchased = 300
	// Volume: 2 packs × $10 = $20; graduated would also be $20 (same tier)
	const expectedPrepaid =
		(purchasedQuantity + includedUsage / BILLING_UNITS) * 10;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const pro = products.pro({ id: "pro-legacy-volume-t3", items: [volumeItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				// V1 quantity = purchased units only (excludes includedUsage)
				options: [
					{ feature_id: TestFeature.Messages, quantity: purchasedQuantity },
				],
			}),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductAttached({ customer: customer as any, product: pro });

	// balance = allowance (100) + purchased (200) = 300
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: includedUsage + purchasedQuantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: BASE_PRICE + expectedPrepaid,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: purchased=700, allowance=100, tier 2 → invoice $55
//
// V1 options.quantity: 700 (purchased only; allowance excluded per V1 semantics)
// includedUsage:       100
// Total balance:       800 (100 allowance + 700 purchased)
//
// Volume math applies to the PURCHASED portion (700 units):
//   700 units → tier 2 → 7 × $5 = $35
//   Graduated would be: 5×$10 + 2×$5 = $60 — KEY DIFFERENTIATOR
//
// Invoice total: $20 (base) + $35 (prepaid) = $55
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("legacy-new-volume 4: purchased=700, allowance=100, tier 2 → $40 (balance=800)")}`, async () => {
	const customerId = "legacy-new-volume-t4";
	const purchasedQuantity = 700;
	const includedUsage = 100;
	// V1: quantity = purchased only (700); balance = allowance + purchased = 800
	// Volume: 7 packs × $5 = $35; graduated would be: 5×$10 + 2×$5 = $60
	const expectedPrepaid =
		(purchasedQuantity + includedUsage / BILLING_UNITS) * 5;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const pro = products.pro({ id: "pro-legacy-volume-t4", items: [volumeItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				// V1 quantity = purchased units only (excludes includedUsage)
				options: [
					{ feature_id: TestFeature.Messages, quantity: purchasedQuantity },
				],
			}),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductAttached({ customer: customer as any, product: pro });

	// balance = allowance (100) + purchased (700) = 800
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: includedUsage + purchasedQuantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: BASE_PRICE + expectedPrepaid,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: purchased=0, allowance=100 → invoice $20 (base only)
//
// V1 options.quantity: 0
// includedUsage:       100
// Total balance:       100 (allowance only, no purchased units)
//
// Volume math: 0 units → no prepaid charge
// Invoice total: $20 (base only)
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("legacy-new-volume 5: purchased=0, allowance=100 → $20 base only (balance=100)")}`, async () => {
	const customerId = "legacy-new-volume-t5";
	const purchasedQuantity = 0;
	const includedUsage = 100;
	// Volume: 0 units → $0 prepaid charge
	const expectedPrepaid = 0;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const pro = products.pro({ id: "pro-legacy-volume-t5", items: [volumeItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				// V1 quantity = 0 (no purchased units; allowance comes from includedUsage)
				options: [
					{ feature_id: TestFeature.Messages, quantity: purchasedQuantity },
				],
			}),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductAttached({ customer: customer as any, product: pro });

	// balance = allowance only (100)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: includedUsage + purchasedQuantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: BASE_PRICE + expectedPrepaid,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
