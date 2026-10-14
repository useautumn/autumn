import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";

test.concurrent(`${chalk.yellowBright("error: prepaid includedUsage must be multiple of billingUnits")}`, async () => {
	const customerId = "prepaid-error-invalid-included-usage";
	const billingUnits = 100;

	const invalidPrepaidItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		includedUsage: 50,
		billingUnits,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-invalid-prepaid",
		items: [invalidPrepaidItem],
	});

	await expect(
		initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		}),
	).rejects.toThrow();
});
