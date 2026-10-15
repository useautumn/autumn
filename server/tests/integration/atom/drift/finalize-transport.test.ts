/**
 * A finalize at the replica that took the customer over from a stopping owner, before the lock's hand-in has landed.
 *
 * Contract:
 *  1. a stopping owner leaves the ring first and hands its customers over, open locks and unlanded entries included, so
 *     the finalize is settled at the new owner on the handed row: 200, never forwarded, never the API's lock_not_found.
 *     Once the hand-ins land in the order they were sent, Autumn holds the owner's lock and then the finalize, one seq
 *     from each journal: the lock closes exactly once, at the usage the finalize confirmed.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import { expectAtomBalance } from "../utils/expectAtomBalance.js";
import { checkOnAtom } from "../utils/expectAtomCheckCorrect.js";
import { finalizeOnAtom } from "../utils/finalizeOnAtom.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";

const replicaSet = useReplicaSet({ size: 2 });

const LOCKED = 30;

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("finalize-transport1: a finalize at the replica that took over from a stopping owner settles on the handed row before the lock's hand-in lands; Autumn then closes the lock exactly once")}`,
	async () => {
		const customerId = "finalize-transport1";
		const lockId = `${customerId}-lock`;
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_6 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});
		const owner = await replicaSet().ownerIndexOf({ customerId });
		const other = 1 - owner;
		for (const index of [owner, other])
			await expectAtomBalance({
				atom: replicaSet().replica(index),
				customerId,
				remaining: 100,
			});

		replicaSet().holdHandIns();
		const locked = await checkOnAtom({
			atom: replicaSet().replica(owner),
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
			requiredBalance: LOCKED,
			lock: { enabled: true, lock_id: lockId },
		});
		expect(locked).toMatchObject({ forwarded: null, body: { allowed: true } });

		// The other replica reads its peers now, so its ring still names the owner for the next few seconds.
		const viaOther = await checkOnAtom({
			atom: replicaSet().replica(other),
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(viaOther.proxied).toBe("owner");
		// Its hand-in held, the owner leaves the ring and hands the customer over, then drains until its public port closes.
		const stopped = replicaSet().stop(owner);
		await pollUntilAsserted({
			fetch: () => replicaSet().health(owner),
			assert: (health) => expect(health).toBe("down"),
		});

		const finalized = await finalizeOnAtom({
			atom: replicaSet().replica(other),
			customerId,
			lockId,
			action: "confirm",
		});
		expect(finalized).toMatchObject({
			status: 200,
			forwarded: null,
			body: { success: true },
		});
		// Settled on the handed row: the new owner's own view already shows the lock confirmed.
		await expectAtomBalance({
			atom: replicaSet().replica(other),
			customerId,
			remaining: 100 - LOCKED,
		});

		await replicaSet().releaseHandIns();
		await stopped;
		// The owner's lock landed first, then the finalize: one seq from each journal, the lock closed once.
		await expectAutumnLockState({
			customerId,
			openLockIds: [],
			atomSeqs: [1, 1],
		});
		const customer = await autumnV2_6.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages]?.usage).toBe(LOCKED);
		await expectAtomBalance({
			atom: replicaSet().replica(other),
			customerId,
			remaining: 100 - LOCKED,
		});
	},
	120_000,
);
