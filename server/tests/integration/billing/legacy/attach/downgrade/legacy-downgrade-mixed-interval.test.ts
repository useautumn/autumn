import { test } from "bun:test";
import { type ApiCustomerV3, BillingInterval } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

test.concurrent(
	`${chalk.yellowBright("legacy-downgrade 4: pro-quarter -> premium -> pro (mixed intervals)")}`,
	async () => {
		const customerId = "legacy-downgrade-4";

		const wordsItem = items.consumableWords();
		const quarterlyPrice = constructPriceItem({
			price: 500,
			interval: BillingInterval.Quarter,
		});

		const proQuarter = constructProduct({
			id: "pro-quarter",
			items: [wordsItem, quarterlyPrice],
			type: "free",
			isDefault: false,
			interval: BillingInterval.Quarter,
		});

		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const pro = products.pro({ id: "pro", items: [wordsItem] });

		const { autumnV1, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [proQuarter, premium, pro] }),
			],
			actions: [s.attach({ productId: proQuarter.id })],
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: proQuarter.id });
		await expectProductScheduled({ customer, productId: premium.id });

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: proQuarter.id });
		await expectProductScheduled({ customer, productId: pro.id });

		const advancedTo = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfWeeks: 6,
			minimumWaitForSeconds: 30,
		});
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: addWeeks(advancedTo, 8).getTime(),
			minimumWaitForSeconds: 30,
		});

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfter,
			productId: pro.id,
		});

		await expectProductNotPresent({
			customer: customerAfter,
			productId: proQuarter.id,
		});
	},
);
