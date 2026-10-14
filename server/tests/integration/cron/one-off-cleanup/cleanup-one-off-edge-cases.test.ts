import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { cleanupOneOffCustomerProducts } from "@/internal/customers/cusProducts/actions/cleanupOneOff/cleanupOneOff.js";
import {
	expectProductStatusesByOrder,
	getFullCustomerWithExpired,
	oneOffCleanupCustomer,
	trackUsageForCleanup,
} from "./utils/oneOffCleanupTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("cleanup: oneoff-unlimited-never-depleted")}`,
	async () => {
		const customerId = "cleanup-oneoff-unlimited-never-depleted";

		const unlimitedMessagesItem = items.unlimitedMessages();

		const oneOff = products.oneOff({
			id: "one-off-unlimited",
			items: [unlimitedMessagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [oneOffCleanupCustomer(), s.products({ list: [oneOff] })],
			actions: [],
		});

		await autumnV1.billing.attach(
			{ customer_id: customerId, product_id: oneOff.id },
			{ timeout: 2000 },
		);

		await timeout(2000);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOff.id,
		});

		await timeout(2000);

		await cleanupOneOffCustomerProducts({ ctx });

		const fullCus = await getFullCustomerWithExpired(customerId);
		expectProductStatusesByOrder({
			fullCus,
			productId: oneOff.id,
			expectedStatuses: [CusProductStatus.Active, CusProductStatus.Active],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cleanup: entity-isolation-only-same-entity-expires")}`,
	async () => {
		const customerId = "cleanup-entity-isolation";

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const oneOff = products.oneOff({
			id: "one-off",
			items: [oneOffMessagesItem],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				oneOffCleanupCustomer(),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [oneOff] }),
			],
			actions: [],
		});

		await autumnV1.billing.attach(
			{
				customer_id: customerId,
				product_id: oneOff.id,
				entity_id: entities[0].id,
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			},
			{ timeout: 2000 },
		);

		await trackUsageForCleanup(autumnV1, {
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entities[0].id,
			value: 100,
		});

		await timeout(2000);

		await autumnV1.billing.attach(
			{
				customer_id: customerId,
				product_id: oneOff.id,
				entity_id: entities[0].id,
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			},
			{ timeout: 2000 },
		);

		await trackUsageForCleanup(autumnV1, {
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entities[0].id,
			value: 100,
		});

		await timeout(2000);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOff.id,
			entity_id: entities[1].id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		});

		await timeout(2000);

		await cleanupOneOffCustomerProducts({ ctx });

		const fullCus = await getFullCustomerWithExpired(customerId);

		const cusProducts = fullCus.customer_products
			.filter((cp) => cp.product.id === oneOff.id)
			.sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));

		expect(cusProducts.length).toBe(3);

		expect(cusProducts[0].status).toBe(CusProductStatus.Expired);

		expect(cusProducts[1].status).toBe(CusProductStatus.Active);

		expect(cusProducts[2].status).toBe(CusProductStatus.Active);
	},
);

test.concurrent(
	`${chalk.yellowBright("cleanup: boolean-coverage-newer-missing-feature")}`,
	async () => {
		const customerId = "cleanup-boolean-coverage-missing";

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const dashboardItem = items.dashboard();
		const adminRightsItem = items.adminRights();

		const oneOff = products.oneOff({
			id: "one-off-two-bool",
			items: [oneOffMessagesItem, dashboardItem, adminRightsItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [oneOffCleanupCustomer(), s.products({ list: [oneOff] })],
			actions: [],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOff.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOff.id,
			items: [oneOffMessagesItem, dashboardItem],
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		});

		await cleanupOneOffCustomerProducts({ ctx });

		const fullCus = await getFullCustomerWithExpired(customerId);
		expectProductStatusesByOrder({
			fullCus,
			productId: oneOff.id,
			expectedStatuses: [CusProductStatus.Active, CusProductStatus.Active],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cleanup: boolean-coverage-same-product-all-covered")}`,
	async () => {
		const customerId = "cleanup-boolean-all-covered";

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const dashboardItem = items.dashboard();
		const adminRightsItem = items.adminRights();

		const oneOff = products.oneOff({
			id: "one-off-two-booleans",
			items: [oneOffMessagesItem, dashboardItem, adminRightsItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [oneOffCleanupCustomer(), s.products({ list: [oneOff] })],
			actions: [],
		});

		await autumnV1.billing.attach(
			{
				customer_id: customerId,
				product_id: oneOff.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			},
			{ timeout: 2000 },
		);

		await trackUsageForCleanup(autumnV1, {
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});

		await timeout(2000);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOff.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		});

		await timeout(2000);

		await cleanupOneOffCustomerProducts({ ctx });

		const fullCus = await getFullCustomerWithExpired(customerId);
		expectProductStatusesByOrder({
			fullCus,
			productId: oneOff.id,
			expectedStatuses: [CusProductStatus.Expired, CusProductStatus.Active],
		});
	},
);
