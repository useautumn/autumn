import { expect, test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductActive,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils";
import { expectScheduledApiSub } from "@tests/utils/expectUtils/expectProductAttached";
import { expectInvoiceAfterUsage } from "@tests/utils/expectUtils/expectSingleUse/expectUsageInvoice";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";

test.concurrent(
	`${chalk.yellowBright("legacy-entities 1: attach to entity via checkout")}`,
	async () => {
		const customerId = "legacy-entities-1";

		const wordsItem = items.consumableWords({ includedUsage: 1500 });
		const pro = products.pro({ id: "pro", items: [wordsItem] });

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
		});

		const entityId = entities[0].id;

		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entityId,
		);

		await expectProductActive({
			customer: entity,
			productId: pro.id,
		});

		if (!isBalanceWorkerRoute()) {
			const customer = await autumnV1.customers.get(customerId);
			await expectProductActive({
				customer,
				productId: pro.id,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("legacy-entities 2: attach pro annual, track usage, invoice after cycle")}`,
	async () => {
		const customerId = "legacy-entities-2";

		const wordsItem = items.consumableWords({ includedUsage: 1500 });
		const proAnnual = products.proAnnual({
			id: "pro-annual",
			items: [wordsItem],
		});

		const { autumnV1, entities, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [proAnnual] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: proAnnual.id, entityIndex: 0 })],
		});

		const entityId = entities[0].id;

		const usage = 1250130;
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Words,
			value: usage,
		});

		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entityId,
		);

		expectCustomerFeatureCorrect({
			customer: entity,
			featureId: TestFeature.Words,
			usage,
		});

		await timeout(2000);
		const nonCachedEntity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entityId,
			{ skip_cache: "true" },
		);

		expectCustomerFeatureCorrect({
			customer: nonCachedEntity,
			featureId: TestFeature.Words,
			usage,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		await expectInvoiceAfterUsage({
			autumn: autumnV1,
			customerId,
			entityId,
			featureId: TestFeature.Words,
			product: proAnnual,
			usage,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			numInvoices: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("legacy-entities 3: attach pro, cancel with usage invoice")}`,
	async () => {
		const customerId = "legacy-entities-3";

		const wordsItem = items.consumableWords({ includedUsage: 1500 });
		const pro = products.pro({ id: "pro", items: [wordsItem] });

		const { autumnV1, entities, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
		});

		const entityId = entities[0].id;

		const usage = 1032100;
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Words,
			value: usage,
		});

		await autumnV1.cancel({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entityId,
		});

		await timeout(5000);

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		await expectInvoiceAfterUsage({
			autumn: autumnV1,
			customerId,
			entityId,
			featureId: TestFeature.Words,
			product: pro,
			usage,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			numInvoices: 2,
			expectExpired: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("legacy-entities 4: attach to multiple entities, track usage separately")}`,
	async () => {
		const customerId = "legacy-entities-4";

		const wordsItem = items.consumableWords({ includedUsage: 1500 });
		const pro = products.pro({ id: "pro", items: [wordsItem] });

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0, timeout: 4000 }),
				s.attach({ productId: pro.id, entityIndex: 1, timeout: 4000 }),
			],
		});

		const entity1Id = entities[0].id;
		const entity2Id = entities[1].id;

		const entity1Usage = Math.floor(Math.random() * 1000000);
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entity1Id,
			feature_id: TestFeature.Words,
			value: entity1Usage,
		});

		const entity1 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity1Id,
		);
		const entity2 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity2Id,
		);

		expectCustomerFeatureCorrect({
			customer: entity1,
			featureId: TestFeature.Words,
			usage: entity1Usage,
		});

		expectCustomerFeatureCorrect({
			customer: entity2,
			featureId: TestFeature.Words,
			usage: 0,
		});

		await timeout(2000);
		const entity1Uncached = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity1Id,
			{ skip_cache: "true" },
		);
		const entity2Uncached = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity2Id,
			{ skip_cache: "true" },
		);

		expectCustomerFeatureCorrect({
			customer: entity1Uncached,
			featureId: TestFeature.Words,
			usage: entity1Usage,
		});

		expectCustomerFeatureCorrect({
			customer: entity2Uncached,
			featureId: TestFeature.Words,
			usage: 0,
		});

		const entity2Usage = Math.floor(Math.random() * 1000000);
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entity2Id,
			feature_id: TestFeature.Words,
			value: entity2Usage,
		});

		const entity1After = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity1Id,
		);
		const entity2After = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity2Id,
		);

		expectCustomerFeatureCorrect({
			customer: entity1After,
			featureId: TestFeature.Words,
			usage: entity1Usage,
		});

		expectCustomerFeatureCorrect({
			customer: entity2After,
			featureId: TestFeature.Words,
			usage: entity2Usage,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("legacy-entities 5: downgrade entity product")}`,
	async () => {
		const customerId = "legacy-entities-5";

		const wordsItem = items.consumableWords({ includedUsage: 1500 });
		const pro = products.pro({ id: "pro", items: [wordsItem] });
		const premium = products.premium({ id: "premium", items: [wordsItem] });

		const { autumnV1, entities, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: premium.id, entityIndex: 0 }),
				s.attach({ productId: premium.id, entityIndex: 1 }),
			],
		});

		const entity1Id = entities[0].id;
		const entity2Id = entities[1].id;

		await autumnV1.attach({
			customer_id: customerId,
			entity_id: entity1Id,
			product_id: pro.id,
		});

		const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity1Id,
		);
		await expectProductScheduled({
			customer: entity1Before,
			productId: pro.id,
		});

		await expectScheduledApiSub({
			customerId,
			entityId: entity1Id,
			productId: pro.id,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfMonths: 1,
			minimumWaitForSeconds: 30,
		});

		const entity1After = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity1Id,
		);
		await expectProductActive({
			customer: entity1After,
			productId: pro.id,
		});
		expect(entity1After.products?.length).toBe(1);

		const entity2After = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity2Id,
		);
		await expectProductActive({
			customer: entity2After,
			productId: premium.id,
		});
		expect(entity2After.products?.length).toBe(1);
	},
);
