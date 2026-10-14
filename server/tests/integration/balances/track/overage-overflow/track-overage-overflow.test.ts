import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { setCustomerSpendLimit } from "../../utils/spend-limit-utils/customerSpendLimitUtils.js";
import {
	expectCustomerFeatureCachedAndDb,
	expectEntityFeatureBalance,
	setEntitySpendLimit,
} from "../../utils/spend-limit-utils/entitySpendLimitUtils.js";
import {
	expectCustomerBalance,
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow1: overflow drives a plain metered balance negative; check and cap-mode tracks stay blocked")}`,
	async () => {
		const customerProduct = products.base({
			id: "overage-overflow-negative",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "overage-overflow-negative-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 150,
			overage_behavior: "overflow",
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 0,
			usage: 150,
		});

		const blocked = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(blocked.allowed).toBe(false);

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 0,
			usage: 150,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow2: overflow punches through a usage limit; counter exceeds it and keeps blocking cap-mode tracks")}`,
	async () => {
		const customerProduct = products.base({
			id: "overage-overflow-window",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "overage-overflow-window-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
			overage_behavior: "overflow",
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 87,
			usage: 13,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 13,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 87,
			usage: 13,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 13,
			limit: 5,
		});

		const blocked = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(blocked.allowed).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow3: a spend limit still clamps an overflow track")}`,
	async () => {
		const customerProduct = products.base({
			id: "overage-overflow-spend-limit",
			items: [
				items.lifetimeMessages({ includedUsage: 1000 }),
				items.consumableMessages({
					includedUsage: 100,
					maxPurchase: 300,
					price: 0.5,
				}),
			],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "overage-overflow-spend-limit-1",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerSpendLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			overageLimit: 25,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1120,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
			overage_behavior: "overflow",
		});
		await expectCustomerFeatureCachedAndDb({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			granted: 1100,
			remaining: 0,
			usage: 1125,
			maxPurchase: 300,
			breakdownLength: 2,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
			overage_behavior: "overflow",
		});
		await expectCustomerFeatureCachedAndDb({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			granted: 1100,
			remaining: 0,
			usage: 1125,
			maxPurchase: 300,
			breakdownLength: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow5: postgres path (skip_cache) drives the balance negative under overflow")}`,
	async () => {
		const customerProduct = products.base({
			id: "overage-overflow-postgres",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "overage-overflow-postgres-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await autumnV2_3.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 150,
				overage_behavior: "overflow",
			},
			{ skipCache: true, timeout: 4000 },
		);
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 0,
			usage: 150,
		});

		await autumnV2_3.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			},
			{ skipCache: true, timeout: 4000 },
		);
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 0,
			usage: 150,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow6: postgres path (skip_cache) spend limit still clamps an overflow track")}`,
	async () => {
		const entityProduct = products.base({
			id: "overage-overflow-pg-spend-limit",
			items: [
				items.consumableMessages({
					includedUsage: 100,
					price: 0.5,
				}),
			],
		});

		const { autumnV2_1, customerId, entities } = await initScenario({
			customerId: "overage-overflow-pg-spend-limit-1",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [entityProduct] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: entityProduct.id, entityIndex: 0 }),
			],
		});

		await setEntitySpendLimit({
			autumn: autumnV2_1,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			overageLimit: 25,
		});

		await autumnV2_1.track(
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				value: 120,
			},
			{ skipCache: true, timeout: 4000 },
		);

		await autumnV2_1.track(
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				value: 10,
				overage_behavior: "overflow",
			},
			{ skipCache: true, timeout: 4000 },
		);
		await expectEntityFeatureBalance({
			autumn: autumnV2_1,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 0,
			usage: 125,
			breakdownLength: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow7: overflow bypasses the usage-limit gate on rollover-funded tracks")}`,
	async () => {
		const messagesItem = items.monthlyMessagesWithRollover({
			includedUsage: 100,
			rolloverConfig: {
				max: 100,
				length: 1,
				duration: RolloverExpiryDurationType.Month,
			},
		});
		const customerProduct = products.base({
			id: "overage-overflow-rollover",
			items: [messagesItem],
		});

		const customerId = "overage-overflow-rollover-1";
		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [
				s.billing.attach({ productId: customerProduct.id }),
				s.track({ featureId: TestFeature.Messages, value: 40, timeout: 4000 }),
				s.resetFeature({
					featureId: TestFeature.Messages,
					timeout: 4000,
				}),
			],
		});

		const afterReset =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterReset,
			featureId: TestFeature.Messages,
			remaining: 160,
			rollovers: [{ balance: 60 }],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
			overage_behavior: "overflow",
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 147,
			usage: 13,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 13,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 147,
			usage: 13,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow8: track_tokens with overflow deducts the full token cost past zero")}`,
	async () => {
		const aiCreditsItem = items.free({
			featureId: TestFeature.AiCredits,
			includedUsage: 0.1,
		});
		const customerProduct = products.base({
			id: "overage-overflow-tokens",
			items: [aiCreditsItem],
		});

		const customerId = "overage-overflow-tokens-1";
		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.attach({ productId: customerProduct.id })],
		});

		await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "custom/internal-model",
			input_tokens: 10_000,
			output_tokens: 5000,
			overage_behavior: "overflow",
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.AiCredits,
			remaining: 0,
			usage: 0.125,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow9: postgres path (skip_cache) customer-level spend limit still clamps overflow")}`,
	async () => {
		const customerProduct = products.base({
			id: "overage-overflow-pg-cus-spend-limit",
			items: [
				items.lifetimeMessages({ includedUsage: 1000 }),
				items.consumableMessages({
					includedUsage: 100,
					maxPurchase: 300,
					price: 0.5,
				}),
			],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "overage-overflow-pg-cus-spend-limit-1",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerSpendLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			overageLimit: 25,
		});

		await autumnV2_1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1120,
			},
			{ skipCache: true, timeout: 4000 },
		);

		await autumnV2_1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
				overage_behavior: "overflow",
			},
			{ skipCache: true, timeout: 4000 },
		);
		await expectCustomerFeatureCachedAndDb({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			granted: 1100,
			remaining: 0,
			usage: 1125,
			maxPurchase: 300,
			breakdownLength: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow10: overflow debt on a consumable feature is invoiced at cycle end")}`,
	async () => {
		const arrearsMessages = constructArrearItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			price: 0.5,
			billingUnits: 1,
			usageLimit: 120,
		});
		const customerProduct = products.pro({
			id: "overage-overflow-invoice",
			items: [arrearsMessages],
		});

		const { autumnV2_1, customerId, ctx, testClockId } = await initScenario({
			customerId: "overage-overflow-invoice-1",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 300,
			overage_behavior: "overflow",
		});
		await timeout(2000);
		await expectCustomerBalance({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 0,
			usage: 300,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 120,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow11: a deep overflow track below the threshold fires auto top-up")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const oneOffProduct = products.oneOffAddOn({
			id: "overage-overflow-topup",
			items: [oneOffItem],
		});

		const { customerId, autumnV2_1 } = await initScenario({
			customerId: "overage-overflow-topup-1",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oneOffProduct] }),
			],
			actions: [
				s.attach({
					productId: oneOffProduct.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await autumnV2_1.customers.update(customerId, {
			billing_controls: {
				auto_topups: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						threshold: 20,
						quantity: 100,
					},
				],
			},
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 300,
			overage_behavior: "overflow",
		});

		await timeout(20_000);

		await expectCustomerBalance({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 0,
			usage: 300,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 10,
			latestStatus: "paid",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-overage-overflow4: a negative value with overflow credits above the granted balance")}`,
	async () => {
		const customerProduct = products.base({
			id: "overage-overflow-refund",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "overage-overflow-refund-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: -50,
			overage_behavior: "overflow",
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 120,
			usage: -20,
		});
	},
);
