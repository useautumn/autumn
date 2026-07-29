import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { listLicensePools } from "./licenseTestUtils.js";

const makeLicenseProduct = () => ({
	...products.base({
		id: "transfer-license",
		items: [items.monthlyMessages({ includedUsage: 25 })],
	}),
});

test.concurrent(
	`${chalk.yellowBright("licenses transfer: license-pool parent cannot be transferred to an entity")}`,
	async () => {
		const parent = products.base({
			id: "transfer-parent",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct();

		const { customerId, entities, autumnV1, autumnV2_2 } = await initScenario({
			customerId: "license-transfer-guard",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});

		const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
		expect(pools).toHaveLength(1);

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV1.transfer(customerId, {
					to_entity_id: entities[0].id,
					product_id: parent.id,
				}),
		});

		const poolsAfter = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
		});
		expect(poolsAfter).toHaveLength(1);
	},
);
