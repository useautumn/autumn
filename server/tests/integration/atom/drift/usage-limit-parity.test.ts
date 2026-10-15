/**
 * A plan's usage limit (a window cap over a larger balance): what the Atom answers, against the API, as deductions on
 * either path fill the window.
 *
 * Setup: 1000 monthly messages, capped at 10 a day by the plan's usage limit.
 *
 * Contract: the Atom answers a check with exactly the API's reply at the window's edges, and a deduction it grants counts
 * in the window at Autumn as it does on its own view:
 *  1. after a track of 8 on the Atom: 2 more fit, 3 do not;
 *  2. after a lock of 2 on the Atom fills the window: nothing more fits, on either path, and Autumn's window holds 10;
 *  3. after that lock is released on the Atom: 2 fit again. The release is handed in after Autumn holds the lock, so
 *     this step stays red until B4 (beginBatch) is fixed.
 */

import { afterAll, expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { atomTestClient } from "../utils/atomTestClient.js";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import {
	atomIsHosted,
	deleteAtomDeployment,
	ensureAtomDeployment,
	type TestAtom,
} from "../utils/ensureAtomDeployment.js";
import { finalizeOnAtom } from "../utils/finalizeOnAtom.js";
import { trackOnAtom } from "../utils/trackOnAtom.js";
import { expectAtomAgrees } from "./utils/expectAtomAgrees.js";
import { lockMessagesOnAtom } from "./utils/lockMessagesOnAtom.js";

const autumn = atomTestClient();

afterAll(async () => {
	await deleteAtomDeployment({ autumn });
});

const DAILY_LIMIT = 10;

/** Both paths agree on what fits in the window: `fits` units do, one more does not. */
const expectWindowAgreed = async ({
	atom,
	api,
	customerId,
	fits,
}: {
	atom: TestAtom;
	api: AutumnInt;
	customerId: string;
	fits: number;
}) => {
	for (const requiredBalance of [fits, fits + 1].filter((value) => value > 0))
		await expectAtomAgrees({
			atom,
			api,
			customerId,
			featureId: TestFeature.Messages,
			requiredBalance,
		});
	const atFit: { allowed: boolean } = await api.post("/balances.check", {
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: fits + 1,
	});
	expect(atFit.allowed).toBe(false);
};

test.skipIf(!isBalanceWorkerRoute() || atomIsHosted())(
	`${chalk.yellowBright("usage-limit-parity1: deductions on the Atom fill the plan's daily window as on the API, and both answer its edges alike")}`,
	async () => {
		const customerId = "usage-limit-parity1";
		const lockId = `${customerId}-lock`;
		const capped = products.base({
			id: "capped",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
			billingControls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						limit: DAILY_LIMIT,
						interval: ResetInterval.Day,
					},
				],
			},
		});
		const { autumnV2_6 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [capped] })],
			actions: [s.billing.attach({ productId: capped.id })],
		});
		const atom = await ensureAtomDeployment({ autumn });
		const window = { atom, api: autumnV2_6, customerId };
		await expectWindowAgreed({ ...window, fits: DAILY_LIMIT });

		const tracked = await trackOnAtom({
			atom,
			customerId,
			featureId: TestFeature.Messages,
			value: 8,
		});
		expect(tracked.forwarded).toBeNull();
		await expectWindowAgreed({ ...window, fits: 2 });

		await lockMessagesOnAtom({
			atom,
			customerId,
			value: 2,
			lock: { enabled: true, lock_id: lockId },
		});
		await expectAutumnLockState({ customerId, openLockIds: [lockId] });
		await expectWindowAgreed({ ...window, fits: 0 });

		const released = await finalizeOnAtom({ atom, customerId, lockId });
		expect(released.status).toBe(200);
		await expectAutumnLockState({ customerId, openLockIds: [] });
		await expectWindowAgreed({ ...window, fits: 2 });
	},
	240_000,
);
