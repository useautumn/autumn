/**
 * TDD test for transferring a plan cusProduct that parents license pools.
 *
 * Red-failure mode (current behavior):
 *  - The transfer succeeds, moving the parent to an entity while its license
 *    pools/assignments stay customer-wide; later lifecycle transitions refuse
 *    entity-scoped successors, so assignments end instead of re-parenting.
 *
 * Green-success criteria (after fix):
 *  - Transfer of a license-pool parent is rejected with a 400, and transfers
 *    of plans without license pools keep working.
 */

import { expect, test } from "bun:test";
import { ErrCode, type LicenseBalanceResponse } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

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
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 1,
		});

		const pools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(pools.list).toHaveLength(1);

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV1.transfer(customerId, {
					to_entity_id: entities[0].id,
					product_id: parent.id,
				}),
		});

		const poolsAfter = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(poolsAfter.list).toHaveLength(1);
	},
);
