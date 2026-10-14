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
	`${chalk.yellowBright("cleanup: single-oneoff-no-newer")}`,
	async () => {
		const customerId = "cleanup-single-oneoff-no-newer";

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

		await cleanupOneOffCustomerProducts({ ctx });

		const fullCus = await getFullCustomerWithExpired(customerId);
		expectProductStatusesByOrder({
			fullCus,
			productId: oneOff.id,
			expectedStatuses: [CusProductStatus.Active],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cleanup: oneoff-not-depleted-both-active")}`,
	async () => {
		const customerId = "cleanup-oneoff-not-depleted-both-active";

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

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOff.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
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
			expectedStatuses: [CusProductStatus.Active, CusProductStatus.Active],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cleanup: three-oneoff-all-depleted")}`,
	async () => {
		const customerId = "cleanup-three-oneoff-middle-depleted";

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

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOff.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
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

		await autumnV1.billing.attach(
			{
				customer_id: customerId,
				product_id: oneOff.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			},
			{ timeout: 2000 },
		);

		await timeout(2000);

		await cleanupOneOffCustomerProducts({ ctx });

		const fullCus = await getFullCustomerWithExpired(customerId);
		expectProductStatusesByOrder({
			fullCus,
			productId: oneOff.id,
			expectedStatuses: [
				CusProductStatus.Expired,
				CusProductStatus.Active,
				CusProductStatus.Active,
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cleanup: attach-twice-no-depletion")}`,
	async () => {
		const customerId = "cleanup-attach-twice-no-depletion";

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

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOff.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
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
			expectedStatuses: [CusProductStatus.Active, CusProductStatus.Active],
		});
	},
);
