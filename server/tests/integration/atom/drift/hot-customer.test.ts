/**
 * One hot customer under concurrent deductions on both paths, through a two-replica Atom (so half the Atom's requests
 * hop to the customer's owner), and an owner that dies while still owing its journal.
 *
 * Contract:
 *  1. 60 tracks of 1 on the Atom and 60 on the API, all in flight at once, against 1000; a track the Atom sheds (503)
 *     is sent to the API, as the SDK falls back: Autumn ends at exactly 880 with one usage event per track, and every
 *     replica's view agrees;
 *  2. the owner grants a deducting check of 60 of 100 and dies before Autumn takes it: a second check of 60, whoever
 *     answers it (the other replica, or the API it forwards to), must not be granted, since the balance cannot cover
 *     both; once the dead owner's journal lands, Autumn's usage is 60, never past the grant.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { getCustomerEvents } from "@tests/integration/balances/utils/events/getCustomerEvents.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
import { expectBalanceCorrect } from "../../utils/expectBalanceCorrect.js";
import { expectAtomBalance } from "../utils/expectAtomBalance.js";
import { checkOnAtom } from "../utils/expectAtomCheckCorrect.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";
import { trackOnAtom } from "../utils/trackOnAtom.js";

const replicaSet = useReplicaSet({ size: 2 });

const initCustomer = async ({
	customerId,
	includedUsage,
}: {
	customerId: string;
	includedUsage: number;
}) => {
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage })],
	});
	return initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.billing.attach({ productId: free.id })],
	});
};

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("hot-customer1: concurrent tracks on the Atom and the API land exactly once each")}`,
	async () => {
		const customerId = "hot-customer1";
		const { autumnV2_6 } = await initCustomer({
			customerId,
			includedUsage: 1000,
		});
		const atom = replicaSet();
		await expectAtomBalance({ atom, customerId, remaining: 1000 });

		const onAtom = Array.from({ length: 60 }, () =>
			trackOnAtom({
				atom,
				customerId,
				featureId: TestFeature.Messages,
				value: 1,
			}),
		);
		const onApi = Array.from({ length: 60 }, () =>
			autumnV2_6.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
			}),
		);
		const atomReplies = await Promise.all(onAtom);
		await Promise.all(onApi);

		// A shed track (503) took nothing: the SDK sends it to the API instead, as it falls back.
		const shed = atomReplies.filter((reply) => reply.status === 503);
		expect(
			atomReplies.filter((reply) => ![202, 503].includes(reply.status)),
		).toEqual([]);
		await Promise.all(
			shed.map(() =>
				autumnV2_6.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
				}),
			),
		);

		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 880,
		});
		await pollUntilAsserted({
			fetch: () => getCustomerEvents({ customerId }),
			assert: (events) => expect(events).toHaveLength(120),
		});
		for (const index of [0, 1])
			await expectAtomBalance({
				atom: replicaSet().replica(index),
				customerId,
				remaining: 880,
			});
	},
	180_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("hot-customer2: an owner that dies owing a grant does not let the next owner grant past the balance")}`,
	async () => {
		const customerId = "hot-customer2";
		const { autumnV2_6 } = await initCustomer({
			customerId,
			includedUsage: 100,
		});
		const owner = await replicaSet().ownerIndexOf({ customerId });
		const other = 1 - owner;
		await expectAtomBalance({ atom: replicaSet(), customerId, remaining: 100 });
		const grant = () =>
			checkOnAtom({
				atom: replicaSet(),
				secretKey: defaultCtx.orgSecretKey,
				customerId,
				featureId: TestFeature.Messages,
				requiredBalance: 60,
				sendEvent: true,
			});

		replicaSet().holdHandIns();
		const first = await grant();
		await replicaSet().kill(owner);
		replicaSet().routeTo(other);
		const second = await grant();
		await replicaSet().releaseHandIns();
		await replicaSet().start(owner);
		replicaSet().routeTo(null);

		const granted = [first, second].filter(
			(reply) => (reply.body as { allowed?: boolean }).allowed,
		).length;
		await pollUntilAsserted({
			fetch: () => getCustomerEvents({ customerId }),
			assert: (events) => expect(events).toHaveLength(granted),
		});
		await flushBalanceWorkerCustomer({ ctx: defaultCtx, customerId });
		const customer = await autumnV2_6.customers.get<ApiCustomerV5>(customerId);
		expect({
			granted,
			usage: customer.balances[TestFeature.Messages]?.usage,
			secondAnsweredBy: second.forwarded ?? "atom",
		}).toMatchObject({ granted: 1, usage: 60 });
	},
	180_000,
);
