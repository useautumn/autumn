/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	ApiVersion,
	AttachBranch,
	CusProductStatus,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import { Decimal } from "decimal.js";
import { AutumnInt } from "@/external/autumn/autumnCli";
import { timeout } from "@/utils/genUtils";

test.concurrent(`${chalk.yellowBright("legacy-trial 1: upgrade during trial (pro → premium)")}`, async () => {
	const customerId = "legacy-trial-1";

	const wordsItem = items.consumableWords();
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [wordsItem, proPrice],
		trialDays: 7,
	});
	const premium = products.base({
		id: "premium",
		items: [wordsItem, premiumPrice],
		trialDays: 7,
	});

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: pro.id,
		status: CusProductStatus.Trialing,
	});

	const curUnix = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addDays(new Date(), 2).getTime(),
	});

	const attachPreview = await autumnV1.attachPreview({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(attachPreview?.branch).toBe(AttachBranch.MainIsTrial);

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: premium.id,
		status: CusProductStatus.Trialing,
	});

	await expectProductTrialing({
		customer: customer as any,
		productId: premium.id,
		trialEndsAt: addDays(curUnix, 7).getTime(),
		toleranceMs: 1000 * 60 * 30,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-trial 2: upgrade after trial ends (pro active → premium trial)")}`, async () => {
	const customerId = "legacy-trial-2";

	const wordsItem = items.consumableWords();
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [wordsItem, proPrice],
		trialDays: 7,
	});
	const premium = products.base({
		id: "premium",
		items: [wordsItem, premiumPrice],
		trialDays: 7,
	});

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: pro.id,
		status: CusProductStatus.Trialing,
	});

	const curUnix = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addDays(new Date(), 12).getTime(),
		waitForSeconds: 30,
	});

	const checkoutRes = await autumnV1.checkout({
		customer_id: customerId,
		product_id: premium.id,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	await timeout(5000);

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: premium.id,
		status: CusProductStatus.Trialing,
	});

	await expectProductTrialing({
		customer: customer as any,
		productId: premium.id,
		trialEndsAt: addDays(curUnix, 7).getTime(),
		toleranceMs: 1000 * 60 * 30,
	});

	await expectCustomerInvoiceCorrect({
		customer: customer as any,
		count: 4,
		latestTotal: 0,
	});

	expect(customer.invoices?.[1]?.total).toBe(
		new Decimal(checkoutRes.total ?? 0).toDP(2).toNumber(),
	);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-trial 3: trial to paid upgrade")}`, async () => {
	const customerId = "legacy-trial-3";

	const proWithTrial = products.proWithTrial({
		id: "pro-trial",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 10 })],
		trialDays: 7,
		cardRequired: true,
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const autumn = new AutumnInt({ secretKey: ctx.orgSecretKey });
	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V0_1,
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proWithTrial, premium] }),
		],
		actions: [
			s.attach({ productId: proWithTrial.id }),
			s.advanceTestClock({ days: 3 }),
		],
	});

	await autumn.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	await timeout(2500);

	const res = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerV0Correct({
		sent: premium,
		cusRes: res,
	});

	const invoices = res.invoices;

	expect(invoices?.[0].total).toBe(50);
	expect(invoices?.[0].product_ids).toContain(premium.id);
});

test.concurrent(`${chalk.yellowBright("legacy-trial 4: trial duplicates with same fingerprint")}`, async () => {
	const customerId = "legacy-trial-4";
	const customerId2 = "legacy-trial-4-dup";
	const randFingerprint = Math.random().toString(36).substring(2, 15);

	const proWithTrial = products.proWithTrial({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 10 }),
			items.adminRights(),
		],
		trialDays: 7,
		cardRequired: true,
		uniqueFingerprint: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({
				paymentMethod: "success",
				data: { fingerprint: randFingerprint },
			}),
			s.otherCustomers([
				{
					id: customerId2,
					paymentMethod: "success",
					data: { fingerprint: randFingerprint },
				},
			]),
			s.products({ list: [proWithTrial] }),
		],
		actions: [s.attach({ productId: proWithTrial.id })],
	});

	const customer1 = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customer1,
		productId: proWithTrial.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customer1,
		count: 1,
		latestTotal: 0,
	});

	await autumnV1.attach({
		customer_id: customerId2,
		product_id: proWithTrial.id,
	});

	const customer2 = await autumnV1.customers.get<ApiCustomerV3>(customerId2);

	await expectProductActive({
		customer: customer2,
		productId: proWithTrial.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customer2,
		count: 1,
		latestTotal: 20,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-trial 5: paid to trial upgrade")}`, async () => {
	const customerId = "legacy-trial-5";

	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 10 }),
			items.adminRights(),
		],
	});

	const premiumWithTrial = products.premiumWithTrial({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premiumWithTrial] }),
		],
		actions: [],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	const customerAfterPro =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfterPro,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPro,
		count: 1,
		latestTotal: 20,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premiumWithTrial.id,
	});

	await expectCustomerInvoiceCorrect({
		autumn: autumnV1,
		customerId,
		count: 3,
		latestTotal: 0,
	});

	const customerAfterPremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterPremium,
		productId: premiumWithTrial.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterPremium,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	expect(customerAfterPremium.invoices?.[1].total).toBe(-20);
});

test.concurrent(`${chalk.yellowBright("legacy-trial 6: trial to trial upgrade with time advancement")}`, async () => {
	const customerId = "legacy-trial-6";

	const proWithTrial = products.proWithTrial({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 10 }),
			items.adminRights(),
		],
		trialDays: 7,
		cardRequired: true,
		uniqueFingerprint: true,
	});

	const premiumWithTrial = products.premiumWithTrial({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [proWithTrial, premiumWithTrial] }),
		],
		actions: [],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: proWithTrial.id,
	});

	const customerAfterPro =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterPro,
		productId: proWithTrial.id,
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addDays(new Date(), 3).getTime(),
		waitForSeconds: 10,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premiumWithTrial.id,
	});

	const customerAfterPremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterPremium,
		productId: premiumWithTrial.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterPremium,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremium,
		count: 2,
		latestTotal: 0,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-trial 7: skip trial with free_trial=false")}`, async () => {
	const customerId = "legacy-trial-7";

	const proWithTrial = products.proWithTrial({
		id: "pro",
		items: [items.consumableWords()],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [proWithTrial] }),
		],
		actions: [],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: proWithTrial.id,
		free_trial: false,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proWithTrial.id,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});
