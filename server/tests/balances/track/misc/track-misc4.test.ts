import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type TrackResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "track-misc4";

describe(`${chalk.yellowBright("track-misc4: track version 1.2 response")}`, () => {
	const customerId = "track-misc4";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [freeProd],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});
	});

	test("should track version 1.2 response", async () => {
		const trackRes: TrackResponseV2 = await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 20,
		});

		expect(trackRes).toMatchObject({
			id: "placeholder",
			code: "event_received",
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			// value: 20,
		});
	});
});
