/**
 * Fractional deductions granted on the Atom and on the API: tenths and sevenths of a unit summed many times, where a
 * float sum drifts (0.1 added ten times is not 1.0 in binary).
 *
 * Contract: the balance lands on the exact decimal on both paths, raw (not rounded), and the Atom answers its edge
 * exactly as the API does: ten tracks of 0.1 and three of 0.7 on each path take 3.1 + 3.1 from 100, leaving 93.8.
 */

import { afterAll, expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import chalk from "chalk";
import { atomTestClient } from "../utils/atomTestClient.js";
import {
	atomIsHosted,
	deleteAtomDeployment,
	ensureAtomDeployment,
} from "../utils/ensureAtomDeployment.js";
import { trackOnAtom } from "../utils/trackOnAtom.js";
import { expectAtomAgrees } from "./utils/expectAtomAgrees.js";
import { initMessagesCustomer } from "./utils/initMessagesCustomer.js";

const autumn = atomTestClient();

afterAll(async () => {
	await deleteAtomDeployment({ autumn });
});

const VALUES = [...Array.from({ length: 10 }, () => 0.1), 0.7, 0.7, 0.7];

test.skipIf(!isBalanceWorkerRoute() || atomIsHosted())(
	`${chalk.yellowBright("decimal-drift1: tenths and sevenths tracked on the Atom and the API land on the exact decimal")}`,
	async () => {
		const customerId = "decimal-drift1";
		const { atom, autumnV2_6 } = await initMessagesCustomer({
			customerId,
			atom: () => ensureAtomDeployment({ autumn }),
		});

		for (const value of VALUES) {
			const onAtom = await trackOnAtom({
				atom,
				customerId,
				featureId: TestFeature.Messages,
				value,
			});
			expect(onAtom.forwarded).toBeNull();
			await autumnV2_6.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value,
				async: false,
			});
		}

		await pollUntilAsserted({
			fetch: () => autumnV2_6.customers.get<ApiCustomerV5>(customerId),
			assert: (customer) =>
				expect(customer.balances[TestFeature.Messages]?.remaining).toBe(93.8),
		});
		for (const requiredBalance of [93.8, 93.80000001])
			await expectAtomAgrees({
				atom,
				api: autumnV2_6,
				customerId,
				featureId: TestFeature.Messages,
				requiredBalance,
			});
	},
	180_000,
);
