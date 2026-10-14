import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const BASE_PRICE = 20;
const TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

test.concurrent(`${chalk.yellowBright("vol-edge: 600 units (included usage and exact tier 1 boundary) → $60")}`, async () => {
	const customerId = "vol-included-edge-boundary-500";
	const includedUsage = 100;
	const quantity = 600;
	const expectedPrepaid = (quantity / BILLING_UNITS) * 10;

	const volItem = items.volumePrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const volPro = products.pro({
		id: "vol-pro-500",
		items: [volItem],
		group: "vol-500",
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [volPro] }),
		],
		actions: [],
	});

	const previewVol = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewVol.total).toBe(BASE_PRICE + expectedPrepaid);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: volPro.id });

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

test.concurrent(`${chalk.yellowBright("vol-edge: 500 units (exact tier 1 boundary) → $50, volume = graduated")}`, async () => {
	const customerId = "vol-edge-boundary-500";
	const quantity = 500;
	const expectedPrepaid = (quantity / BILLING_UNITS) * 10;

	const volItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const gradItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const volPro = products.pro({
		id: "vol-pro-500",
		items: [volItem],
		group: "vol-500",
	});
	const gradBase = products.base({
		id: "grad-base-500",
		items: [gradItem, items.monthlyPrice({ price: BASE_PRICE })],
		group: "grad-500",
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [volPro, gradBase] }),
		],
		actions: [],
	});

	const previewVol = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewVol.total).toBe(BASE_PRICE + expectedPrepaid);

	const previewGrad = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: gradBase.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewGrad.total).toBe(BASE_PRICE + expectedPrepaid);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: gradBase.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: volPro.id });
	await expectProductActive({ customer, productId: gradBase.id });

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: BASE_PRICE + expectedPrepaid,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: BASE_PRICE + expectedPrepaid,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("vol-edge: 501 units (ceil to 600) → volume $30, graduated $55, balance 600")}`, async () => {
	const customerId = "vol-edge-ceiling-501";
	const quantity = 501;
	const ceiledQuantity = 600;
	const volExpectedPrepaid = (ceiledQuantity / BILLING_UNITS) * 5;
	const gradExpectedPrepaid =
		500 * (10 / BILLING_UNITS) + 100 * (5 / BILLING_UNITS);

	const volItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const gradItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const volPro = products.pro({
		id: "vol-pro-501",
		items: [volItem],
		group: "vol-501",
	});
	const gradBase = products.base({
		id: "grad-base-501",
		items: [gradItem, items.monthlyPrice({ price: BASE_PRICE })],
		group: "grad-501",
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [volPro, gradBase] }),
		],
		actions: [],
	});

	const previewVol = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewVol.total).toBe(BASE_PRICE + volExpectedPrepaid);

	const previewGrad = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: gradBase.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewGrad.total).toBe(BASE_PRICE + gradExpectedPrepaid);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: gradBase.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: volPro.id });
	await expectProductActive({ customer, productId: gradBase.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: ceiledQuantity * 2,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: BASE_PRICE + gradExpectedPrepaid,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: BASE_PRICE + volExpectedPrepaid,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("vol-edge: includedUsage=200, qty=800 → volume 8 total packs $40, graduated $55")}`, async () => {
	const customerId = "vol-edge-included-800";
	const quantity = 800;
	const includedUsage = 200;
	const totalUnits = quantity;

	const volExpectedPrepaid = (totalUnits / BILLING_UNITS) * 5;
	const gradExpectedPrepaid =
		500 * (10 / BILLING_UNITS) + 100 * (5 / BILLING_UNITS);

	const volItem = items.volumePrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});
	const gradItem = items.tieredPrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const volPro = products.pro({
		id: "vol-pro-inc",
		items: [volItem],
		group: "vol-inc",
	});
	const gradBase = products.base({
		id: "grad-base-inc",
		items: [gradItem, items.monthlyPrice({ price: BASE_PRICE })],
		group: "grad-inc",
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [volPro, gradBase] }),
		],
		actions: [],
	});

	const previewVol = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewVol.total).toBe(BASE_PRICE + volExpectedPrepaid);

	const previewGrad = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: gradBase.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(previewGrad.total).toBe(BASE_PRICE + gradExpectedPrepaid);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: gradBase.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: volPro.id });
	await expectProductActive({ customer, productId: gradBase.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity * 2,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: BASE_PRICE + gradExpectedPrepaid,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 1,
		latestTotal: BASE_PRICE + volExpectedPrepaid,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("vol-edge: includedUsage=500 covers qty=300 → 0 purchased packs, $0 prepaid, balance=500")}`, async () => {
	const customerId = "vol-edge-included-all";
	const quantity = 300;
	const includedUsage = 500;

	const volItem = items.volumePrepaidMessages({
		includedUsage,
		billingUnits: BILLING_UNITS,
		tiers: TIERS,
	});

	const volPro = products.pro({ id: "vol-pro-inc-all", items: [volItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [volPro] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(BASE_PRICE);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: volPro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: volPro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: includedUsage,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: BASE_PRICE,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
