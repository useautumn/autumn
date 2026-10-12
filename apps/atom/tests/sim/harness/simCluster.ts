import { createSubjectState } from "@autumn/balance-engine";
import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import { LATEST_VERSION } from "@autumn/shared";
import {
	createCatalogFor,
	createCatalogRowsFor,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { hashToken } from "../../../src/auth/hashToken.js";
import { atomOrg } from "../../unit/utils/atomFixtures.js";
import {
	createSimNetwork,
	type Endpoint,
	type NetworkProfile,
	type Observed,
	QUIET_NETWORK,
} from "./simNetwork.js";
import {
	createSimReplica,
	createVolume,
	destroyVolume,
	SIM_PORT,
	SIM_SLOT_COUNT,
	type SimReplica,
	type Volume,
} from "./simReplica.js";
import { createSeededRandom, createVirtualClock } from "./virtualClock.js";

const ATOM_TOKEN = "atom_token_sim";
const TOKEN_HASH = hashToken({ token: ATOM_TOKEN });
const PEER_SECRET = "sim-peer-secret-".repeat(4);
const FEATURE = "messages";
/** Autumn pushes a subject within this; past it the push is given up on (no retry for a subject push). */
const PUSH_TIMEOUT_MS = 2_000;
const CHECK_TIMEOUT_MS = 5_000;

export type Version = { readAt: number; logOffset: bigint };
const newer = (a: Version, b: Version) =>
	a.readAt > b.readAt || (a.readAt === b.readAt && a.logOffset > b.logOffset);

export type Applied = {
	customerId: string;
	version: Version;
	balance: number;
	at: number;
};
export type CheckRecord = {
	at: number;
	customerId: string;
	to: string;
	status: number | "ERR";
	balance?: number;
	proxied: boolean;
	answeredByReady: boolean;
};

export type ClusterOptions = {
	seed: number;
	profile?: Partial<NetworkProfile>;
	customers?: number;
	log?: boolean;
};

/**
 * One org's Atom as its replicas, Autumn pushing to them through a load balancer that routes from the first listen,
 * and a customer app checking through the same balancer. Everything is driven by one seed and one virtual clock.
 */
export const createSimCluster = ({
	seed,
	profile = {},
	customers = 8,
	log = false,
}: ClusterOptions) => {
	const rng = createSeededRandom(seed);
	const clock = createVirtualClock();
	const network = createSimNetwork({
		clock,
		rng,
		profile: { ...QUIET_NETWORK, ...profile },
	});
	const lines: string[] = [];
	const say = (line: string) => {
		lines.push(
			`${((clock.now() - 1_700_000_000_000) / 1000).toFixed(3)}s ${line}`,
		);
		if (log) console.log(lines.at(-1));
	};
	const customerIds = Array.from(
		{ length: customers },
		(_, i) => `cus_${i + 1}`,
	);
	const replicas = new Map<string, SimReplica>();
	const volumes = new Map<string, Volume>();
	const skews = new Map<string, number>();
	const opened: SimReplica[] = [];
	const allVolumes: Volume[] = [];
	let logOffset = 0n;
	const versions = new Map<string, number>();
	const applied: Applied[] = [];
	const checks: CheckRecord[] = [];
	let catalogReadAt = 0;
	const background = new Set<Promise<unknown>>();

	const outside: Endpoint = {
		id: 0,
		address: "autumn",
		alive: () => true,
		ready: () => true,
		request: () => Promise.reject(new Error("nothing listens here")),
	};
	const outsideFetch = network.fetchFor(outside);

	const track = (task: Promise<unknown>) => {
		background.add(task);
		task.finally(() => background.delete(task)).catch(() => {});
	};

	const subjectBody = ({
		customerId,
		balance,
		readAt,
	}: {
		customerId: string;
		balance: number;
		readAt: number;
	}) => {
		const state = createSubjectState({
			identity: { ...identity, customerId },
			customerProducts: [createCustomerProduct()],
			customerEntitlements: [createCustomerEntitlement({ balance })],
		});
		logOffset += 1n;
		return {
			version: { readAt, logOffset },
			text: JSON.stringify({
				state,
				catalog: createCatalogFor({ state }),
				org: atomOrg,
				log_offset: logOffset.toString(),
				read_at: readAt,
			}),
		};
	};

	const boundAddress = (): string | null => {
		const routable = network.routable();
		return routable.length === 0 ? null : rng.pick(routable);
	};

	/** Autumn's next read of a customer: a newer version, pushed to whichever replica the balancer picks. */
	async function push({
		customerId = rng.pick(customerIds),
		readAt = clock.now(),
	}: {
		customerId?: string;
		readAt?: number;
	} = {}) {
		const balance = (versions.get(customerId) ?? 0) + 1;
		versions.set(customerId, balance);
		const { version, text } = subjectBody({ customerId, balance, readAt });
		const to = boundAddress();
		if (!to) {
			say(`push ${customerId}@${balance} lost: nothing listening`);
			return;
		}
		const sentAt = clock.now();
		try {
			const reply = await outsideFetch(
				`http://${to}:${SIM_PORT}/v1/subjects.set`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-atom-token": ATOM_TOKEN,
						[ATOM_CUSTOMER_ID_HEADER]: customerId,
					},
					body: text,
					signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
				},
			);
			const { stored } = (await reply.json()) as { stored: boolean };
			if (reply.status === 200 && stored)
				applied.push({ customerId, version, balance, at: clock.now() });
			else
				say(
					`push ${customerId}@${balance} to ${to}: ${reply.status} stored=${stored}`,
				);
		} catch (error) {
			say(
				`push ${customerId}@${balance} to ${to} failed after ${clock.now() - sentAt}ms: ${String(error).slice(0, 40)}`,
			);
		}
	}

	async function pushCatalog() {
		catalogReadAt = clock.now();
		const rows = createCatalogRowsFor({
			state: createSubjectState({
				identity,
				customerProducts: [createCustomerProduct()],
				customerEntitlements: [createCustomerEntitlement({ balance: 1 })],
			}),
		});
		const to = boundAddress();
		if (!to) return;
		try {
			await outsideFetch(`http://${to}:${SIM_PORT}/v1/catalog.set`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-atom-token": ATOM_TOKEN,
				},
				body: JSON.stringify({ rows, read_at: catalogReadAt }),
				signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
			});
		} catch {}
	}

	/** The customer's app checking a balance through the balancer; what it was told is kept for the staleness bound. */
	async function check({
		customerId = rng.pick(customerIds),
	}: {
		customerId?: string;
	} = {}) {
		const to = boundAddress();
		if (!to) return;
		const target = replicas.get(to);
		const at = clock.now();
		try {
			const reply = await outsideFetch(
				`http://${to}:${SIM_PORT}/v1/balances.check`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-atom-token": ATOM_TOKEN,
						"x-api-version": LATEST_VERSION,
					},
					body: JSON.stringify({
						customer_id: customerId,
						feature_id: FEATURE,
					}),
					signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
				},
			);
			const proxied = reply.headers.get("x-atom-proxied") !== null;
			const body = (await reply.json()) as { balance?: { remaining?: number } };
			const hop = proxied
				? network.observed
						.filter((o) => o.proxied && o.from === target?.id && o.at >= at)
						.at(-1)
				: network.observed
						.filter(
							(o) =>
								o.from === 0 &&
								o.to === to &&
								o.at === at &&
								o.path === "/v1/balances.check",
						)
						.at(-1);
			checks.push({
				at,
				customerId,
				to,
				status: reply.status,
				balance: body.balance?.remaining,
				proxied,
				answeredByReady: hop?.targetReady ?? false,
			});
		} catch (error) {
			checks.push({
				at,
				customerId,
				to,
				status: "ERR",
				proxied: false,
				answeredByReady: false,
			});
			say(`check ${customerId} to ${to} failed: ${String(error).slice(0, 40)}`);
		}
	}

	function create({
		address,
		fresh = false,
		skewMs,
	}: {
		address: string;
		fresh?: boolean;
		skewMs?: number;
	}): SimReplica {
		if (skewMs !== undefined) skews.set(address, skewMs);
		let volume = volumes.get(address);
		if (!volume || fresh) {
			volume = createVolume();
			volumes.set(address, volume);
			allVolumes.push(volume);
		}
		const replica = createSimReplica({
			ctx: {
				clock,
				network,
				tokenHash: TOKEN_HASH,
				secret: PEER_SECRET,
				address,
				volume,
				skewMs: skews.get(address) ?? 0,
				log: say,
			},
		});
		replicas.set(address, replica);
		opened.push(replica);
		return replica;
	}

	/** Boots a replica on an address; its catch-up and settle passes run as the clock does. */
	function start(params: {
		address: string;
		fresh?: boolean;
		skewMs?: number;
	}): SimReplica {
		const replica = create(params);
		say(
			`${params.address}#${replica.id} starting${params.fresh ? " on a fresh volume" : ""}`,
		);
		track(replica.start());
		return replica;
	}

	function stop(address: string): Promise<void> {
		const replica = replicas.get(address);
		if (!replica?.alive()) return Promise.resolve();
		say(`${address}#${replica.id} stopping`);
		const done = replica.stop();
		track(done);
		return done;
	}

	function kill(address: string): void {
		replicas.get(address)?.kill();
	}

	/** Stops or kills, then boots again after `afterMs` on the same volume, or a fresh one. */
	function restart({
		address,
		graceful,
		afterMs,
		fresh = false,
	}: {
		address: string;
		graceful: boolean;
		afterMs: number;
		fresh?: boolean;
	}) {
		track(
			(async () => {
				if (graceful) await stop(address);
				else kill(address);
				await clock.sleep(afterMs);
				start({ address, fresh });
			})(),
		);
	}

	function remove(address: string) {
		track(
			(async () => {
				await stop(address);
				replicas.delete(address);
			})(),
		);
	}

	/** Advances the clock in steps, with Autumn pushing and the app checking at the given rates, and `onStep` between. */
	async function runFor({
		ms,
		pushesPerSecond = 5,
		checksPerSecond = 10,
		catalogPushesPerMinute = 1,
		onStep,
	}: {
		ms: number;
		pushesPerSecond?: number;
		checksPerSecond?: number;
		catalogPushesPerMinute?: number;
		onStep?: (step: { at: number }) => void;
	}) {
		const STEP_MS = 100;
		for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) {
			if (rng.chance((pushesPerSecond * STEP_MS) / 1000)) track(push());
			if (rng.chance((checksPerSecond * STEP_MS) / 1000)) track(check());
			if (rng.chance((catalogPushesPerMinute * STEP_MS) / 60_000))
				track(pushCatalog());
			onStep?.({ at: clock.now() });
			await clock.run(STEP_MS);
		}
	}

	/** What a replica holds for every customer, straight from its slot files. */
	async function held(
		replica: SimReplica,
	): Promise<Map<string, { version: Version; balance: number }>> {
		const byCustomer = new Map<string, { version: Version; balance: number }>();
		for (let slot = 0; slot < SIM_SLOT_COUNT; slot++) {
			const subjects = await replica.slots.listSince({
				slot,
				after: null,
				cursor: null,
				limit: 100_000,
			});
			for (const { subject } of subjects) {
				const balance =
					subject.state.customerEntitlements[0]?.balance ?? Number.NaN;
				byCustomer.set(subject.state.identity.customerId, {
					version: { readAt: subject.readAt, logOffset: subject.logOffset },
					balance,
				});
			}
		}
		return byCustomer;
	}

	return {
		rng,
		clock,
		network,
		customerIds,
		lines,
		replicas,
		alive: () => [...replicas.values()].filter((r) => r.alive()),
		ready: () => [...replicas.values()].filter((r) => r.isReady()),
		addresses: () => [...replicas.keys()],
		start,
		stop,
		kill,
		restart,
		remove,
		/** Every customer pushed once, so a check never has to leave for Autumn. */
		seedCustomers: async () => {
			for (const customerId of customerIds) track(push({ customerId }));
			await clock.run(1_000);
		},
		push,
		pushCatalog,
		check,
		runFor,
		settle: () => clock.run(0),
		held,
		applied,
		checks,
		catalogReadAt: () => catalogReadAt,
		newer,
		/** Waits out whatever the replicas still have going, then releases every file. */
		destroy: async () => {
			await clock.run(0);
			for (const replica of opened) replica.kill();
			for (const volume of allVolumes) destroyVolume(volume);
		},
	};
};

export type SimCluster = ReturnType<typeof createSimCluster>;
export type { Observed };
