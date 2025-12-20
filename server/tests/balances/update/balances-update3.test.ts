import { beforeAll, describe, test } from "bun:test";
import { ApiVersion, type LimitedItem } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../utils/genUtils";

const workflows = constructFeatureItem({
	featureId: TestFeature.Workflows,
	includedUsage: 5,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [workflows],
});

const testCase = "balances-update3";

describe(`${chalk.yellowBright("balances-update3: testing update balance to increase granted balance and track negative")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

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

		await autumnV2.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});
	});

	test("should update balance and have correct v2 api balance for one off interval", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Workflows,
			current_balance: 10,
		});

		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Workflows,
			value: 5,
		});

		await timeout(2000);

		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Workflows,
			value: -5,
		});

		await timeout(2000);
	});
});
