import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const PRO_BASE_PRICE = 20;

const VOLUME_TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: scheduled switch mid-cycle, 300 units tier 1 → tier 1")}`, async () => {
	const customerId = "attach-prepaid-volume-sched-mid-t1";
	const initQuantity = 300;
	const newQuantity = 300;

	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const premium = products.premium({
		id: "premium-volume-sched-mid-t1",
		items: [premiumItem],
	});
	const pro = products.pro({
		id: "pro-volume-sched-mid-t1",
		items: [proItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: initQuantity,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({ customer, count: 1 });
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: scheduled switch after cycle, 300 units tier 1 → tier 1 (pro $20 + $30)")}`, async () => {
	const customerId = "attach-prepaid-volume-sched-after-t1";
	const initQuantity = 300;
	const newQuantity = 300;
	const expectedNewPrepaid = (newQuantity / BILLING_UNITS) * 10;

	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const premium = products.premium({
		id: "premium-volume-sched-after-t1",
		items: [premiumItem],
	});
	const pro = products.pro({
		id: "pro-volume-sched-after-t1",
		items: [proItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
			}),
			s.advanceToNextInvoice(),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: newQuantity,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: PRO_BASE_PRICE + expectedNewPrepaid,
	});
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: scheduled switch mid-cycle, 800 → 300 units tier 2 → tier 1")}`, async () => {
	const customerId = "attach-prepaid-volume-sched-mid-t2-t1";
	const initQuantity = 800;
	const newQuantity = 300;

	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const premium = products.premium({
		id: "premium-volume-sched-mid-t2-t1",
		items: [premiumItem],
	});
	const pro = products.pro({
		id: "pro-volume-sched-mid-t2-t1",
		items: [proItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: initQuantity,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({ customer, count: 1 });
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: scheduled switch after cycle, 800 → 300 units tier 2 → tier 1 (pro $20 + $30)")}`, async () => {
	const customerId = "attach-prepaid-volume-sched-after-t2-t1";
	const initQuantity = 800;
	const newQuantity = 300;
	const expectedNewPrepaid = (newQuantity / BILLING_UNITS) * 10;

	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const premium = products.premium({
		id: "premium-volume-sched-after-t2-t1",
		items: [premiumItem],
	});
	const pro = products.pro({
		id: "pro-volume-sched-after-t2-t1",
		items: [proItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
			}),
			s.advanceToNextInvoice(),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: newQuantity,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: PRO_BASE_PRICE + expectedNewPrepaid,
	});
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: scheduled switch mid-cycle, 1000 → 600 units tier 2 → tier 2")}`, async () => {
	const customerId = "attach-prepaid-volume-sched-mid-t2-t2";
	const initQuantity = 1000;
	const newQuantity = 600;

	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const premium = products.premium({
		id: "premium-volume-sched-mid-t2-t2",
		items: [premiumItem],
	});
	const pro = products.pro({
		id: "pro-volume-sched-mid-t2-t2",
		items: [proItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
		],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});
	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: initQuantity,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({ customer, count: 1 });
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume: scheduled switch after cycle, 1000 → 600 units tier 2 → tier 2 (pro $20 + $30 volume, not $55 graduated)")}`, async () => {
	const customerId = "attach-prepaid-volume-sched-after-t2-t2";
	const initQuantity = 1000;
	const newQuantity = 600;
	const expectedNewPrepaid = (newQuantity / BILLING_UNITS) * 5;

	const premiumItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});
	const proItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: VOLUME_TIERS,
	});

	const premium = products.premium({
		id: "premium-volume-sched-after-t2-t2",
		items: [premiumItem],
	});
	const pro = products.pro({
		id: "pro-volume-sched-after-t2-t2",
		items: [proItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: initQuantity }],
			}),
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
			}),
			s.advanceToNextInvoice(),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: newQuantity,
		usage: 0,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: PRO_BASE_PRICE + expectedNewPrepaid,
	});
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
