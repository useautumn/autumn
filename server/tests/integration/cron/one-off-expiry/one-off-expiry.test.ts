import { test } from "bun:test";
import { CusProductStatus, customerProducts } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { expireOneOffCustomerProducts } from "@/internal/customers/cusProducts/actions/expireOneOff/expireOneOff.js";
import {
	expectProductStatusesByOrder,
	getFullCustomerWithExpired,
} from "../one-off-cleanup/utils/oneOffCleanupTestUtils.js";

test.concurrent(`${chalk.yellowBright("one-off-expiry: ended_at expires access")}`, async () => {
	const customerId = "oneoff-expiry-ended-at";
	const oneOff = products.oneOff({
		id: "one-off-ended",
		items: [
			items.oneOffMessages({
				includedUsage: 0,
				billingUnits: 100,
				price: 10,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	let fullCus = await getFullCustomerWithExpired(customerId);
	const cusProduct = fullCus.customer_products.find(
		(cp) => cp.product.id === oneOff.id,
	);
	const endedAt = Date.now() + 1000;

	await ctx.db
		.update(customerProducts)
		.set({ ended_at: endedAt })
		.where(eq(customerProducts.id, cusProduct!.id));

	await expireOneOffCustomerProducts({ ctx, nowMs: endedAt + 1 });

	fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [CusProductStatus.Expired],
	});
});
