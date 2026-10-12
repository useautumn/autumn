import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import {
	ANTI_ENTROPY_EVERY_MS,
	ANTI_ENTROPY_WINDOW_MS,
} from "../../src/replication/createReplicaSync.js";
import { HOLD_MS } from "../../src/replication/outbox/createPeerOutbox.js";
import {
	assertConverged,
	assertFreshness,
	assertNoErrors,
	assertNoLoops,
} from "./harness/invariants.js";
import { createSimCluster, type SimCluster } from "./harness/simCluster.js";
import type { NetworkProfile } from "./harness/simNetwork.js";

/** How many seeds each scenario runs; raise it locally (ATOM_SIM_SEEDS=500) for a long sweep. */
const SEEDS = Number(process.env.ATOM_SIM_SEEDS ?? 25);
const FIRST_SEED = Number(process.env.ATOM_SIM_FIRST_SEED ?? 1);
const ONLY = process.env.ATOM_SIM_SEED
	? [Number(process.env.ATOM_SIM_SEED)]
	: null;
const seeds = ONLY ?? Array.from({ length: SEEDS }, (_, i) => FIRST_SEED + i);
const LOG = process.env.ATOM_SIM_SEED !== undefined;

const ADDRESSES = ["10.244.1.10", "10.244.2.10", "10.244.3.10"];
/** Long enough for the balancer to register every address, so the first checks are not all answered by one replica. */
const WARM_MS = 20_000;
/** After the chaos: one anti-entropy period past the relay hold, so what any replica alone held has reached the others. */
const QUIET_MS = HOLD_MS + 2 * ANTI_ENTROPY_EVERY_MS;

const CHAOTIC_NETWORK: Partial<NetworkProfile> = {
	delayMs: [1, 400],
	dropRate: 0.1,
	dupRate: 0.1,
};

/** A check Atom leaves to the Autumn API never leaves the simulation: the API is down for the whole run. */
beforeAll(() => {
	spyOn(globalThis, "fetch").mockRejectedValue(
		new TypeError("connect ECONNREFUSED api.autumn.example"),
	);
});
afterAll(() => spyOn(globalThis, "fetch").mockRestore());

type Scenario = {
	name: string;
	profile?: Partial<NetworkProfile>;
	/** Entities per customer, pushed as views beside the customer's own. */
	entities?: number;
	planEndRate?: number;
	skews?: number[];
	/** The chaos, run with traffic for `ms`; `onStep` fires every 100 ms of simulated time. */
	chaos: (cluster: SimCluster) => {
		ms: number;
		onStep?: (step: { at: number }) => void;
		after?: () => void;
	};
	/** Once the replica is ready, no answer is staler than this. Omitted where the chaos itself makes it meaningless. */
	freshnessBoundMs?: number;
	/** Whether every check must get an answer. */
	noErrors?: boolean;
	/** Whether checks may be answered 504 while a replica starts (a proxied check whose peer timed out). */
	allowPeerTimeouts?: boolean;
};

const boot = async (cluster: SimCluster, skews: number[] = []) => {
	for (const [i, address] of ADDRESSES.entries())
		cluster.start({ address, skewMs: skews[i] ?? 0 });
	await cluster.runFor({
		ms: 10_000,
		pushesPerSecond: 0,
		checksPerSecond: 0,
		catalogPushesPerMinute: 0,
	});
	expect(cluster.ready().length).toBe(3);
	await cluster.runFor({
		ms: WARM_MS,
		pushesPerSecond: 0,
		checksPerSecond: 0,
		catalogPushesPerMinute: 0,
	});
	await cluster.seedCustomers();
};

/** Brings every address back up and ready, then lets the replicas settle with nothing else going on. */
const recover = async (cluster: SimCluster) => {
	for (const address of cluster.addresses())
		if (!cluster.replicas.get(address)?.alive()) cluster.start({ address });
	await cluster.runFor({
		ms: 5_000,
		pushesPerSecond: 0,
		checksPerSecond: 0,
		catalogPushesPerMinute: 0,
	});
	await cluster.runFor({
		ms: QUIET_MS,
		pushesPerSecond: 0,
		checksPerSecond: 0,
		catalogPushesPerMinute: 0,
	});
	expect(cluster.alive().every((replica) => replica.isReady())).toBe(true);
};

const runScenario = async ({
	scenario,
	seed,
}: {
	scenario: Scenario;
	seed: number;
}) => {
	const cluster = createSimCluster({
		seed,
		profile: scenario.profile,
		entities: scenario.entities,
		planEndRate: scenario.planEndRate,
		log: LOG,
	});
	try {
		await boot(cluster, scenario.skews);
		const { ms, onStep, after } = scenario.chaos(cluster);
		await cluster.runFor({ ms, onStep });
		after?.();
		await recover(cluster);
		await assertConverged({ cluster });
		assertNoLoops({ cluster });
		if (scenario.freshnessBoundMs !== undefined)
			assertFreshness({ cluster, boundMs: scenario.freshnessBoundMs });
		if (scenario.noErrors)
			assertNoErrors({
				cluster,
				allowPeerTimeouts: scenario.allowPeerTimeouts ?? false,
			});
	} catch (error) {
		throw new Error(
			`seed ${seed} (ATOM_SIM_SEED=${seed}): ${(error as Error).message}\n${cluster.lines.slice(-30).join("\n")}`,
		);
	} finally {
		await cluster.destroy();
	}
};

/** Kills or stops a random replica now and brings it back after a while, on its volume or a fresh one. */
const restartOne = ({
	cluster,
	fresh,
}: {
	cluster: SimCluster;
	fresh: boolean;
}) => {
	const alive = cluster.alive();
	const victim = cluster.rng.pick(
		alive.length > 0 ? alive : [...cluster.replicas.values()],
	);
	if (!victim) return;
	cluster.restart({
		address: victim.address,
		graceful: cluster.rng.chance(0.5),
		afterMs: cluster.rng.int(0, 5_000),
		fresh: fresh && cluster.rng.chance(0.3),
	});
};

const scenarios: Scenario[] = [
	{
		name: "a quiet network: three replicas converge and answer fresh",
		chaos: () => ({ ms: 30_000 }),
		freshnessBoundMs: 1_000,
		noErrors: true,
	},
	{
		name: "delay, reorder, duplication and loss on every relay and catch-up",
		profile: CHAOTIC_NETWORK,
		chaos: () => ({ ms: 60_000 }),
		// Retries wait a second each; past a few of them a copy is at most this late.
		freshnessBoundMs: 15_000,
	},
	{
		name: "replicas killed or stopped at random points, mid-catch-up and mid-flush included",
		chaos: (cluster) => ({
			ms: 90_000,
			onStep: () => {
				// Hits a replica at any point: a few per minute, and more often while one is starting or flushing.
				const starting = [...cluster.replicas.values()].find(
					(r) => r.state() === "starting" || r.state() === "stopping",
				);
				if (starting && cluster.rng.chance(0.05)) starting.kill();
				else if (cluster.rng.chance(0.004))
					restartOne({ cluster, fresh: true });
			},
		}),
		// A write that died with its relay comes back with the replica: restart delay, boot and the resend.
		freshnessBoundMs: 15_000,
	},
	{
		name: "every replica restarting at once",
		chaos: (cluster) => ({
			ms: 60_000,
			onStep: ({ at }) => {
				if (at - 1_700_000_000_000 !== 30_000 + WARM_MS + 10_000 + 1_000)
					return;
				for (const replica of cluster.alive())
					cluster.restart({
						address: replica.address,
						graceful: cluster.rng.chance(0.5),
						afterMs: cluster.rng.int(0, 5_000),
						fresh: cluster.rng.chance(0.2),
					});
			},
		}),
		freshnessBoundMs: 15_000,
	},
	{
		name: "peers come and go: scale up and down, an address reused, and a stale service name",
		profile: { dnsLagMs: 3_000 },
		chaos: (cluster) => {
			let extra = 4;
			return {
				ms: 120_000,
				onStep: () => {
					const roll = cluster.rng.next();
					if (roll < 0.003 && cluster.addresses().length < 5)
						cluster.start({ address: `10.244.${extra++}.10`, fresh: true });
					else if (roll < 0.006 && cluster.addresses().length > 2)
						cluster.remove(cluster.rng.pick(cluster.addresses()));
					else if (roll < 0.008) {
						// An address given up comes back with a fresh volume behind it.
						const gone = ADDRESSES.find(
							(address) => !cluster.replicas.has(address),
						);
						if (gone) cluster.start({ address: gone, fresh: true });
					}
				},
			};
		},
		freshnessBoundMs: 15_000,
	},
	{
		name: "clocks minutes apart between replicas",
		skews: [-3 * 60_000, 0, 4 * 60_000],
		chaos: (cluster) => ({
			ms: 60_000,
			onStep: () => {
				if (cluster.rng.chance(0.003)) restartOne({ cluster, fresh: false });
			},
		}),
		freshnessBoundMs: 15_000,
	},
	{
		name: "a replica cut off longer than the relay hold, then back",
		chaos: (cluster) => {
			const cutOff = cluster.rng.pick(ADDRESSES);
			cluster.network.partition({ address: cutOff });
			return {
				ms: HOLD_MS + 60_000,
				after: () => cluster.network.heal(),
			};
		},
	},
	{
		name: "a replica cut off longer than the repair window, then back: what it missed is still repaired",
		chaos: (cluster) => {
			const cutOff = cluster.rng.pick(ADDRESSES);
			cluster.network.partition({ address: cutOff });
			return {
				ms: ANTI_ENTROPY_WINDOW_MS + 5 * 60_000,
				after: () => cluster.network.heal(),
			};
		},
	},
	{
		name: "customers with entities: a view of an entity never wipes the customer's rows, and both converge",
		entities: 2,
		profile: { delayMs: [1, 200], dropRate: 0.05 },
		chaos: (cluster) => ({
			ms: 90_000,
			onStep: () => {
				if (cluster.rng.chance(0.004)) restartOne({ cluster, fresh: false });
			},
		}),
		freshnessBoundMs: 15_000,
	},
	{
		name: "a customer-level plan ending through an entity's view clears the customer's rows everywhere",
		entities: 2,
		planEndRate: 0.1,
		profile: { delayMs: [1, 200], dropRate: 0.05 },
		chaos: (cluster) => ({
			ms: 90_000,
			onStep: () => {
				if (cluster.rng.chance(0.004)) restartOne({ cluster, fresh: false });
			},
		}),
		freshnessBoundMs: 15_000,
	},
	{
		name: "the ready gate under churn: checks proxied while replicas start, never twice, never in a loop",
		profile: { delayMs: [1, 300], dropRate: 0.05 },
		chaos: (cluster) => ({
			ms: 90_000,
			onStep: () => {
				if (cluster.rng.chance(0.006)) restartOne({ cluster, fresh: true });
			},
		}),
		allowPeerTimeouts: true,
	},
];

for (const scenario of scenarios)
	describe(scenario.name, () => {
		test.each(seeds)(
			"seed %i",
			async (seed) => runScenario({ scenario, seed }),
			60_000,
		);
	});
