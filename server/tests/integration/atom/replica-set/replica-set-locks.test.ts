/**
 * Locks on an org's Atom run as a replica set: real Atom processes on this machine behind one balancer.
 *
 * Contract:
 *  1. (L12) locks on one customer sent to both replicas at once never reserve more than its balance: every check
 *     reaches the customer's one owner, which takes each lock in turn, and Autumn lands one row per lock it granted.
 */

import { expect, test } from "bun:test";
import { balanceLocks } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { expectBalanceCorrect } from "../../utils/expectBalanceCorrect.js";
import { expectAtomBalance } from "../utils/expectAtomBalance.js";
import { checkOnAtom } from "../utils/expectAtomCheckCorrect.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";

const replicaSet = useReplicaSet({ size: 2 });
const LOCKS = 20;
const LOCK_VALUE = 10;

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("atom-replica-locks1: L12 locks sent to both replicas at once never reserve more than the balance")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId } = await initScenario({
			customerId: "atom-replica-locks1",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});
		for (const index of [0, 1])
			await expectAtomBalance({
				atom: replicaSet().replica(index),
				customerId,
				remaining: 100,
			});

		const replies = await Promise.all(
			Array.from({ length: LOCKS }, (_, index) =>
				checkOnAtom({
					atom: replicaSet().replica(index % 2),
					secretKey: defaultCtx.orgSecretKey,
					customerId,
					featureId: TestFeature.Messages,
					requiredBalance: LOCK_VALUE,
					lock: { enabled: true, lock_id: `atom-replica-locks1-${index}` },
				}),
			),
		);

		const granted = replies.filter(
			({ body }) => (body as { allowed: boolean }).allowed,
		);
		expect(replies.map(({ status }) => status)).toEqual(Array(LOCKS).fill(200));
		expect(granted).toHaveLength(100 / LOCK_VALUE);
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 0,
		});
		await pollUntilAsserted({
			fetch: () =>
				defaultCtx.db
					.select({ lockId: balanceLocks.lock_id })
					.from(balanceLocks)
					.where(
						and(
							eq(balanceLocks.org_id, defaultCtx.org.id),
							eq(balanceLocks.env, defaultCtx.env),
							eq(balanceLocks.customer_id, customerId),
						),
					),
			assert: (rows) => expect(rows).toHaveLength(100 / LOCK_VALUE),
		});
	},
	120_000,
);
