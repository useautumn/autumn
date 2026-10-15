/**
 * A credit system funding two features at fractional costs (action1 0.2, action2 0.6 credits each), beside action1's
 * own grant of 5: the same deductions and a partly confirmed lock, once through the Atom and once through the API, on
 * twin customers.
 *
 * Contract: balances move to the exact decimal on both paths, and the Atom answers from the same balance:
 *  track 7 action1 (5 own, then 2 = 0.4 credits), lock 13 action1 (2.6), confirm it at 4 (gives back 1.8),
 *  track 3 action2 (1.8): credits 100 → 97, action1's own grant spent.
 * Both customers end at exactly 97 credits; the Atom allows 485 action1 (97 / 0.2) and refuses 486, as the API does.
 * The Atom's confirm is handed in after Autumn holds its lock, so it stays red until B4 (beginBatch) is fixed.
 */

import { afterAll, expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectBalanceCorrect } from "../../utils/expectBalanceCorrect.js";
import { atomTestClient } from "../utils/atomTestClient.js";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import {
	atomIsHosted,
	deleteAtomDeployment,
	ensureAtomDeployment,
} from "../utils/ensureAtomDeployment.js";
import {
	checkOnAtom,
	expectAtomCheckCorrect,
} from "../utils/expectAtomCheckCorrect.js";
import { finalizeOnAtom } from "../utils/finalizeOnAtom.js";
import { trackOnAtom } from "../utils/trackOnAtom.js";

const autumn = atomTestClient();

afterAll(async () => {
	await deleteAtomDeployment({ autumn });
});

const CREDITS_LEFT = 97;

test.skipIf(!isBalanceWorkerRoute() || atomIsHosted())(
	`${chalk.yellowBright("credit-drift1: fractional credit costs and a partly confirmed lock land the exact same credits on the Atom and the API")}`,
	async () => {
		const customerId = "credit-drift1";
		const apiCustomerId = `${customerId}-api`;
		const lockId = `${customerId}-lock`;
		const credits = products.base({
			id: "credits",
			// The Atom answers a feature only once the customer's own catalog names it.
			items: [
				items.free({ featureId: TestFeature.Action1, includedUsage: 5 }),
				items.free({ featureId: TestFeature.Action2, includedUsage: 0 }),
				items.monthlyCredits({ includedUsage: 100 }),
			],
		});
		const { autumnV2_6 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: apiCustomerId }]),
				s.products({ list: [credits] }),
			],
			actions: [
				s.billing.attach({ productId: credits.id }),
				s.billing.attach({ productId: credits.id, customerId: apiCustomerId }),
			],
		});
		const atom = await ensureAtomDeployment({ autumn });
		await expectAtomCheckCorrect({
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Action1,
			requiredBalance: 500,
			allowed: true,
		});

		// On the Atom.
		const tracked = await trackOnAtom({
			atom,
			customerId,
			featureId: TestFeature.Action1,
			value: 7,
		});
		const locked = await checkOnAtom({
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Action1,
			requiredBalance: 13,
			lock: { enabled: true, lock_id: lockId },
		});
		await expectAutumnLockState({ customerId, openLockIds: [lockId] });
		const confirmed = await finalizeOnAtom({
			atom,
			customerId,
			lockId,
			action: "confirm",
			overrideValue: 4,
		});
		const trackedOther = await trackOnAtom({
			atom,
			customerId,
			featureId: TestFeature.Action2,
			value: 3,
		});
		expect({
			tracked: tracked.forwarded,
			locked: locked.forwarded,
			confirmed: confirmed.forwarded,
			trackedOther: trackedOther.forwarded,
		}).toEqual({
			tracked: null,
			locked: null,
			confirmed: null,
			trackedOther: null,
		});

		// The same on the API.
		await autumnV2_6.track({
			customer_id: apiCustomerId,
			feature_id: TestFeature.Action1,
			value: 7,
			async: false,
		});
		await autumnV2_6.check({
			customer_id: apiCustomerId,
			feature_id: TestFeature.Action1,
			required_balance: 13,
			lock: { enabled: true, lock_id: `${apiCustomerId}-lock` },
		});
		await autumnV2_6.balances.finalize({
			customer_id: apiCustomerId,
			lock_id: `${apiCustomerId}-lock`,
			action: "confirm",
			override_value: 4,
		});
		await autumnV2_6.track({
			customer_id: apiCustomerId,
			feature_id: TestFeature.Action2,
			value: 3,
			async: false,
		});

		for (const id of [customerId, apiCustomerId])
			await expectBalanceCorrect({
				customerId: id,
				featureId: TestFeature.Credits,
				remaining: CREDITS_LEFT,
				usage: 100 - CREDITS_LEFT,
			});
		for (const id of [customerId, apiCustomerId])
			await expectBalanceCorrect({
				customerId: id,
				featureId: TestFeature.Action1,
				remaining: 0,
				usage: 5,
			});
		await expectAutumnLockState({ customerId, openLockIds: [] });
		const [onAtom, onApi] = await Promise.all(
			[customerId, apiCustomerId].map((id) =>
				autumnV2_6.customers.get<ApiCustomerV5>(id),
			),
		);
		expect(onAtom.balances[TestFeature.Credits]?.breakdown?.[0]).toMatchObject({
			remaining: onApi.balances[TestFeature.Credits]?.breakdown?.[0]?.remaining,
			usage: onApi.balances[TestFeature.Credits]?.breakdown?.[0]?.usage,
		});
		for (const [requiredBalance, allowed] of [
			[CREDITS_LEFT / 0.2, true],
			[CREDITS_LEFT / 0.2 + 1, false],
		] as const)
			await expectAtomCheckCorrect({
				atom,
				secretKey: defaultCtx.orgSecretKey,
				customerId,
				featureId: TestFeature.Action1,
				requiredBalance,
				allowed,
			});
	},
	180_000,
);
