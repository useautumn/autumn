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
	`${chalk.yellowBright("cleanup: oneoff-monthly-messages-both-active")}`,
	async () => {
		const customerId = "cleanup-oneoff-monthly-messages";

		const monthlyMessagesItem = items.monthlyMessages({ includedUsage: 100 });

		const oneOff = products.oneOff({
			id: "one-off-monthly",
			items: [monthlyMessagesItem],
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
			value: 50,
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
			expectedStatuses: [CusProductStatus.Active, CusProductStatus.Active],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cleanup: lifetime-then-monthly-both-active")}`,
	async () => {
		const customerId = "cleanup-lifetime-then-monthly";

		const lifetimeMessagesItem = items.lifetimeMessages({ includedUsage: 100 });
		const monthlyMessagesItem = items.monthlyMessages({ includedUsage: 100 });

		const oneOffLifetime = products.oneOff({
			id: "one-off-lifetime",
			items: [lifetimeMessagesItem],
		});

		const oneOffMonthly = products.oneOff({
			id: "one-off-monthly",
			items: [monthlyMessagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				oneOffCleanupCustomer(),
				s.products({ list: [oneOffLifetime, oneOffMonthly] }),
			],
			actions: [],
		});

		await autumnV1.billing.attach(
			{ customer_id: customerId, product_id: oneOffLifetime.id },
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
			product_id: oneOffMonthly.id,
		});

		await timeout(2000);

		await cleanupOneOffCustomerProducts({ ctx });

		const fullCusAfter = await getFullCustomerWithExpired(customerId);
		expectProductStatusesByOrder({
			fullCus: fullCusAfter,
			productId: oneOffLifetime.id,
			expectedStatuses: [CusProductStatus.Active],
		});
		expectProductStatusesByOrder({
			fullCus: fullCusAfter,
			productId: oneOffMonthly.id,
			expectedStatuses: [CusProductStatus.Active],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cleanup: oneoff-prepaid-boolean-only-latest")}`,
	async () => {
		const customerId = "cleanup-oneoff-prepaid-boolean";

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const dashboardItem = items.dashboard();

		const oneOff = products.oneOff({
			id: "one-off-bool",
			items: [oneOffMessagesItem, dashboardItem],
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
	`${chalk.yellowBright("cleanup: oneoff-boolean-newer-without-boolean")}`,
	async () => {
		const customerId = "cleanup-oneoff-boolean-newer-no-bool";

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const dashboardItem = items.dashboard();

		const oneOffWithBool = products.oneOff({
			id: "one-off-with-bool",
			items: [oneOffMessagesItem, dashboardItem],
		});

		const oneOffNoBool = products.oneOff({
			id: "one-off-no-bool",
			items: [oneOffMessagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				oneOffCleanupCustomer(),
				s.products({ list: [oneOffWithBool, oneOffNoBool] }),
			],
			actions: [],
		});

		await autumnV1.billing.attach(
			{
				customer_id: customerId,
				product_id: oneOffWithBool.id,
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
			product_id: oneOffNoBool.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		});

		await timeout(2000);

		await cleanupOneOffCustomerProducts({ ctx });

		const fullCus = await getFullCustomerWithExpired(customerId);
		expectProductStatusesByOrder({
			fullCus,
			productId: oneOffWithBool.id,
			expectedStatuses: [CusProductStatus.Active],
		});
		expectProductStatusesByOrder({
			fullCus,
			productId: oneOffNoBool.id,
			expectedStatuses: [CusProductStatus.Active],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cleanup: oneoff-lifetime-allocated-both-active")}`,
	async () => {
		const customerId = "cleanup-oneoff-lifetime-allocated";

		const lifetimeMessagesItem = items.lifetimeMessages({ includedUsage: 100 });
		const freeUsersItem = items.freeUsers({ includedUsage: 5 });

		const oneOff = products.oneOff({
			id: "one-off-mixed",
			items: [lifetimeMessagesItem, freeUsersItem],
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

		await trackUsageForCleanup(autumnV1, {
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 5,
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
			expectedStatuses: [CusProductStatus.Active, CusProductStatus.Active],
		});
	},
);
