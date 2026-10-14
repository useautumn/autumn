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

// DISABLED: attach V1 rejects volume tiers by design (handlePrepaidVolumeErrors); V2 attach covers
// volume in attach-prepaid-volume*.test.ts. Delete if V1 volume is never reopened.
test.skip(`${chalk.yellowBright("legacy-new-volume 1: purchased=300, no allowance, tier 1 → $50")}`, async () => {
	const customerId = "legacy-new-volume-t1";
	const purchasedQuantity = 300;
	const includedUsage = 0;
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

// DISABLED: attach V1 rejects volume tiers by design (handlePrepaidVolumeErrors); V2 attach covers
// volume in attach-prepaid-volume*.test.ts. Delete if V1 volume is never reopened.
test.skip(`${chalk.yellowBright("legacy-new-volume 2: purchased=800, no allowance, tier 2 → $60 (graduated would be $65)")}`, async () => {
	const customerId = "legacy-new-volume-t2";
	const purchasedQuantity = 800;
	const includedUsage = 0;
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

// DISABLED: attach V1 rejects volume tiers by design (handlePrepaidVolumeErrors); V2 attach covers
// volume in attach-prepaid-volume*.test.ts. Delete if V1 volume is never reopened.
test.skip(`${chalk.yellowBright("legacy-new-volume 3: purchased=200, allowance=100, tier 1 → $20 (balance=300)")}`, async () => {
	const customerId = "legacy-new-volume-t3";
	const purchasedQuantity = 200;
	const includedUsage = 100;
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

// DISABLED: attach V1 rejects volume tiers by design (handlePrepaidVolumeErrors); V2 attach covers
// volume in attach-prepaid-volume*.test.ts. Delete if V1 volume is never reopened.
test.skip(`${chalk.yellowBright("legacy-new-volume 4: purchased=700, allowance=100, tier 2 → $40 (balance=800)")}`, async () => {
	const customerId = "legacy-new-volume-t4";
	const purchasedQuantity = 700;
	const includedUsage = 100;
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

// DISABLED: attach V1 rejects volume tiers by design (handlePrepaidVolumeErrors); V2 attach covers
// volume in attach-prepaid-volume*.test.ts. Delete if V1 volume is never reopened.
test.skip(`${chalk.yellowBright("legacy-new-volume 5: purchased=0, allowance=100 → $20 base only (balance=100)")}`, async () => {
	const customerId = "legacy-new-volume-t5";
	const purchasedQuantity = 0;
	const includedUsage = 100;
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
