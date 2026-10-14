import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted, timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectAtomBalance } from "../utils/expectAtomBalance.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";
import { startTraffic } from "../utils/startTraffic.js";

const replicaSet = useReplicaSet({ size: 2 });
const CONVERGE_TIMEOUT_MS = 90_000;

const freeMessages = () =>
	products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("atom-replica-restart1: a replica restarted mid-traffic serves no stale balance once ready")}`,
	async () => {
		const free = freeMessages();
		const trafficCustomerId = "atom-replica-restart1-traffic";
		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "atom-replica-restart1",
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: trafficCustomerId }]),
				s.products({ list: [free] }),
			],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.billing.attach({ productId: free.id, customerId: trafficCustomerId }),
			],
		});
		const track = ({ customer, value }: { customer: string; value: number }) =>
			autumnV2_4.track({
				customer_id: customer,
				feature_id: TestFeature.Messages,
				value,
			});
		await track({ customer: customerId, value: 10 });
		await expectAtomBalance({
			atom: replicaSet().replica(1),
			customerId,
			remaining: 90,
		});
		const traffic = startTraffic({
			send: () => track({ customer: trafficCustomerId, value: 1 }),
			everyMs: 200,
		});

		await replicaSet().stop(1);
		await track({ customer: customerId, value: 30 });
		await expectAtomBalance({
			atom: replicaSet().replica(0),
			customerId,
			remaining: 60,
		});
		await replicaSet().start(1);
		await expectAtomBalance({
			atom: replicaSet().replica(1),
			customerId,
			remaining: 60,
			timeoutMs: 0,
		});
		await traffic.stop();
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("atom-replica-restart2: both replicas restarting together converge with no lost pushes")}`,
	async () => {
		const free = freeMessages();
		const customerIds = Array.from(
			{ length: 4 },
			(_, index) => `atom-replica-restart2-${index}`,
		);
		const [held, justBeforeStop, ...whileBooting] = customerIds;
		const { autumnV2_4 } = await initScenario({
			customerId: held,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers(customerIds.slice(1).map((id) => ({ id }))),
				s.products({ list: [free] }),
			],
			actions: customerIds.map((id) =>
				s.billing.attach({ productId: free.id, customerId: id }),
			),
		});
		const trackedAt = new Map<string, number>();
		const track = (id: string) => {
			trackedAt.set(id, Date.now());
			return autumnV2_4.track({
				customer_id: id,
				feature_id: TestFeature.Messages,
				value: customerIds.indexOf(id) + 1,
			});
		};
		await track(held);
		for (const index of [0, 1])
			await expectAtomBalance({
				atom: replicaSet().replica(index),
				customerId: held,
				remaining: 99,
			});

		await track(justBeforeStop);
		await pollUntilAsserted({
			fetch: async () => isAcknowledgedAfterTrack(justBeforeStop),
			assert: (landed) => expect(landed).toBe(true),
		});
		const restarting = replicaSet().restartAll();
		await waitUntilAnyReplicaStarting();
		for (const id of whileBooting) await track(id);
		await restarting;

		const acknowledged = customerIds.filter(isAcknowledgedAfterTrack);
		expect(
			acknowledged.filter((id) => whileBooting.includes(id)),
		).not.toHaveLength(0);
		for (const id of acknowledged)
			for (const index of [0, 1])
				await expectAtomBalance({
					atom: replicaSet().replica(index),
					customerId: id,
					remaining: 100 - (customerIds.indexOf(id) + 1),
					timeoutMs: CONVERGE_TIMEOUT_MS,
				});

		function isAcknowledgedAfterTrack(id: string): boolean {
			const sentAt = trackedAt.get(id) ?? Number.POSITIVE_INFINITY;
			return replicaSet()
				.pushes()
				.some(
					(push) =>
						push.customerId === id && push.at >= sentAt && push.status === 200,
				);
		}
	},
	CONVERGE_TIMEOUT_MS + 120_000,
);

const waitUntilAnyReplicaStarting = async (): Promise<void> => {
	for (;;) {
		const health = await Promise.all(
			[0, 1].map((index) => replicaSet().health(index)),
		);
		if (health.includes("starting")) return;
		await timeout(50);
	}
};
