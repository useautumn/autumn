/**
 * `/usage` on a feature the customer holds no balance for is refused, as `balances.update` refuses it, on both routes.
 *
 * Red (before): legacy answered 200 `{ success: true }` and changed nothing; the balance worker route answered 404.
 * Green (after): both answer 404 `customer_entitlement_not_found`.
 */

import { test } from "bun:test";
import { ApiVersion, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("set-usage-no-balance1: /usage on a feature with no balance is a 404")}`,
	async () => {
		const free = products.base({
			id: "set-usage-no-balance",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const customerId = "set-usage-no-balance1";
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});

		await expectAutumnError({
			errCode: ErrCode.CustomerEntitlementNotFound,
			func: () =>
				autumnV2_3.usage({
					customer_id: customerId,
					feature_id: TestFeature.Action1,
					value: 5,
				}),
		});
	},
);
