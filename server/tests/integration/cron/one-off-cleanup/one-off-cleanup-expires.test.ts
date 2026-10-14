import { test } from "bun:test";
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
	`${chalk.yellowBright("cleanup: two-oneoff-both-depleted")}`,
	async () => {
		const customerId = "cleanup-two-oneoff-both-depleted";

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const oneOff = products.oneOff({
			id: "one-off",
			items: [oneOffMessagesItem],
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

		await cleanupOneOffCustomerProducts({ ctx });

		const fullCus = await getFullCustomerWithExpired(customerId);
		expectProductStatusesByOrder({
			fullCus,
			productId: oneOff.id,
			expectedStatuses: [CusProductStatus.Expired, CusProductStatus.Active],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cleanup: oneoff-depleted-newer-active")}`,
	async () => {
		const customerId = "cleanup-oneoff-depleted-newer-active";

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const oneOff = products.oneOff({
			id: "one-off",
			items: [oneOffMessagesItem],
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

test.concurrent(
	`${chalk.yellowBright("cleanup: oneoff-lifetime-messages-only-latest")}`,
	async () => {
		const customerId = "cleanup-oneoff-lifetime-messages";

		const lifetimeMessagesItem = items.lifetimeMessages({ includedUsage: 100 });

		const oneOff = products.oneOff({
			id: "one-off-lifetime",
			items: [lifetimeMessagesItem],
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

		await trackUsageForCleanup(autumnV1, {
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});

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
			expectedStatuses: [CusProductStatus.Expired, CusProductStatus.Active],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cleanup: oneoff-prepaid-then-attach-again")}`,
	async () => {
		const customerId = "cleanup-oneoff-then-lifetime-prepaid";

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const oneOff = products.oneOff({
			id: "one-off",
			items: [oneOffMessagesItem],
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

test.concurrent(
	`${chalk.yellowBright("cleanup: base-oneoff-prepaid-depleted")}`,
	async () => {
		const customerId = "cleanup-base-oneoff-prepaid-depleted";

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const baseProduct = products.base({
			id: "base-with-credits",
			items: [oneOffMessagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [oneOffCleanupCustomer(), s.products({ list: [baseProduct] })],
			actions: [],
		});

		await autumnV1.billing.attach(
			{
				customer_id: customerId,
				product_id: baseProduct.id,
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
			product_id: baseProduct.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		});

		await timeout(2000);

		await cleanupOneOffCustomerProducts({ ctx });

		const fullCus = await getFullCustomerWithExpired(customerId);
		expectProductStatusesByOrder({
			fullCus,
			productId: baseProduct.id,
			expectedStatuses: [CusProductStatus.Expired, CusProductStatus.Active],
		});
	},
);
