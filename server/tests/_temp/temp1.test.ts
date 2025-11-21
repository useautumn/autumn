import { beforeAll, describe, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "free",
	isDefault: true,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Workflows,
			includedUsage: 5,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 200,
		}),
	],
});

describe(`${chalk.yellowBright("temp: Testing add ons")}`, () => {
	const customerId = "temp";
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: customerId,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	test("should attach pro product", async () => {
		const res = await Promise.all(
			Array.from({ length: 7 }, () =>
				autumn.check({
					customer_id: customerId,
					feature_id: TestFeature.Workflows,
					send_event: true,
				}),
			),
		);

		const allowedCount = res.filter((r) => r.allowed).length;
		console.log("Allowed count", allowedCount);
	});
});
