import { test } from "bun:test";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";

test.concurrent(`${chalk.yellowBright("error: attach custom plan same config as existing")}`, async () => {
	const customerId = "err-custom-plan-same-config";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				items: [messagesItem, priceItem],
				redirect_mode: "if_required",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("error: attach custom plan invalid feature id")}`, async () => {
	const customerId = "err-custom-plan-invalid-feature";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.base({ id: "pro", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const invalidFeatureItem = constructFeatureItem({
		featureId: "non_existent_feature_12345",
		includedUsage: 100,
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				items: [invalidFeatureItem],
				redirect_mode: "if_required",
			});
		},
	});
});
