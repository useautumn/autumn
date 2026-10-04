/**
 * Owner-issued check leases held at the server: a repeat check is answered from the owner's reply until the
 * lease lapses, the server writes to the customer, or the org's catalog changes. Refusals are never held.
 */

import { describe, expect, test } from "bun:test";
import {
	type CheckCommand,
	catalogRowsToCatalog,
	createSubjectState,
	parseCheckCommand,
	type TrackCommand,
} from "@autumn/balance-engine";
import {
	type CheckReply,
	createBalanceWorkerClient,
	type TrackReply,
} from "../src/balanceWorkerClient.js";
import { createCheckLeases } from "../src/checkLeases/createCheckLeases.js";
import type { SharedCheckLeases } from "../src/checkLeases/types/checkLeases.js";
import type {
	HttpRequest,
	HttpResponse,
} from "../src/http/types/httpClient.js";

const SKEW_MS = 100;
const identity = {
	orgId: "org",
	env: "sandbox",
	customerId: "customer",
	entityId: null,
};
const orgConfig = {
	reverse_deduction_order: false,
	block_overdue_entitlements: false,
	include_past_due: true,
};

const checkOf = ({
	entityId = null,
	featureId = "messages",
	requiredBalance = 1,
	properties = null,
	customerId = "customer",
}: {
	entityId?: string | null;
	featureId?: string;
	requiredBalance?: number;
	properties?: Record<string, string> | null;
	customerId?: string;
} = {}): CheckCommand =>
	parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			org: { config: orgConfig },
			requestId: "check",
			identity: { ...identity, customerId, entityId },
			featureId,
			internalFeatureId: `feat_${featureId}`,
			requiredBalance,
			properties,
			occurredAt: Date.now(),
		},
	});

const state = createSubjectState({ identity });
const replyOf = ({
	allowed = true,
	lease = { expiresAt: Date.now() + 1_000 },
	balance = 10,
}: {
	allowed?: boolean;
	lease?: CheckReply["lease"];
	balance?: number;
} = {}): CheckReply => ({
	result: {
		allowed,
		reason: allowed ? null : "insufficient_balance",
		limitType: null,
		requiredBalance: 1,
		fundingFeatureId: "messages",
		isFlag: false,
	},
	state: { ...state, revision: balance },
	catalog: catalogRowsToCatalog({ rows: [] }),
	lease,
});

const trackCommand: TrackCommand = {
	schemaVersion: 1,
	type: "track",
	org: { config: orgConfig },
	commandId: "track",
	requestId: "track",
	identity,
	featureId: "messages",
	internalFeatureId: "feat_messages",
	value: 1,
	overageBehavior: "reject",
	properties: null,
	usageEvent: { name: "messages", idempotencyKey: null, id: null },
	occurredAt: 0,
};
const trackReply: TrackReply = {
	state,
	catalog: catalogRowsToCatalog({ rows: [] }),
	changes: [],
	result: {
		type: "track",
		status: "applied",
		reason: null,
		deltas: [],
		deductions: [],
		internalProductId: null,
		fundingFeatureId: "messages",
		fundingCreditCost: 1,
	},
};

/** The owner answers every check with `answer()`, every track with `trackReply`; requests are recorded by path. */
function createFixture({
	answer = () => replyOf(),
	maxEntries = 100,
	leases = true,
}: {
	answer?: (command: CheckCommand) => CheckReply;
	maxEntries?: number;
	leases?: boolean;
} = {}) {
	const paths: string[] = [];
	const leaseAsks: (string | undefined)[] = [];
	async function postJson(request: HttpRequest): Promise<HttpResponse> {
		const path = new URL(request.url).pathname;
		paths.push(path);
		if (path === "/v1/check") {
			leaseAsks.push(request.headers?.["x-check-lease"]);
			const { command } = request.body as { command: CheckCommand };
			return { status: 200, body: answer(command) };
		}
		return { status: 200, body: trackReply };
	}
	const published: string[] = [];
	const client = createBalanceWorkerClient({
		ctx: {
			owners: {
				findOwner: () => ({
					partition: 0,
					routeEpoch: "1",
					endpoint: "http://worker-a:8080",
				}),
				refresh: async () => undefined,
			},
			http: { postJson },
			catalogInvalidations: {
				invalidateOrgCatalog: async ({ orgId }) => {
					published.push(orgId);
				},
			},
		},
		config: {
			partitionCount: 1,
			timeoutMs: 1_000,
			batchTracks: false,
			...(leases && { checkLeases: { maxEntries } }),
		},
	});
	const checksSent = () => paths.filter((path) => path === "/v1/check").length;
	return { client, checksSent, published, leaseAsks };
}

describe("check leases at the server", () => {
	test("only a server holding leases asks the owner for one; without the config no check asks", async () => {
		const leasing = createFixture();
		await leasing.client.check({ command: checkOf() });
		expect(leasing.leaseAsks).toEqual(["1"]);
		const plain = createFixture({ leases: false });
		await plain.client.check({ command: checkOf() });
		await plain.client.check({ command: checkOf() });
		expect(plain.leaseAsks).toEqual([undefined, undefined]);
	});

	test("a lease hit returns the owner's reply without asking the owner again", async () => {
		const fixture = createFixture();
		const fromOwner = await fixture.client.check({ command: checkOf() });
		const fromLease = await fixture.client.check({ command: checkOf() });
		expect(fromLease).toBe(fromOwner);
		expect(JSON.stringify(fromLease)).toBe(JSON.stringify(fromOwner));
		expect(fixture.checksSent()).toBe(1);
		expect(fixture.client.readCheckLeaseCounters?.()).toEqual({
			leaseHit: 1,
			leaseSharedHit: 0,
			leaseMiss: 1,
			leaseIssued: 1,
			leaseBypassDenied: 0,
			leaseWithheld: 0,
			leaseEvicted: 0,
			leaseSharedErrors: 0,
			size: 1,
		});
	});

	test("a refusal is never held, even if a lease came with it", async () => {
		const fixture = createFixture({
			answer: () => replyOf({ allowed: false }),
		});
		await fixture.client.check({ command: checkOf() });
		await fixture.client.check({ command: checkOf() });
		expect(fixture.checksSent()).toBe(2);
		expect(fixture.client.readCheckLeaseCounters?.()).toMatchObject({
			leaseHit: 0,
			leaseBypassDenied: 2,
			leaseIssued: 0,
		});
	});

	test("an answer the owner did not lease, or an older worker's reply, asks the owner every time", async () => {
		const withheld = createFixture({ answer: () => replyOf({ lease: null }) });
		await withheld.client.check({ command: checkOf() });
		await withheld.client.check({ command: checkOf() });
		expect(withheld.checksSent()).toBe(2);
		const older = createFixture({
			answer: () => {
				const { lease: _lease, ...reply } = replyOf();
				return reply;
			},
		});
		await older.client.check({ command: checkOf() });
		await older.client.check({ command: checkOf() });
		expect(older.checksSent()).toBe(2);
		expect(older.client.readCheckLeaseCounters?.()).toMatchObject({
			leaseWithheld: 2,
		});
	});

	test("each entity, feature, required balance and customer has its own lease; properties never lease", async () => {
		let answered = 0;
		const fixture = createFixture({
			answer: () => replyOf({ balance: ++answered }),
		});
		const entityA = await fixture.client.check({
			command: checkOf({ entityId: "a" }),
		});
		const entityB = await fixture.client.check({
			command: checkOf({ entityId: "b" }),
		});
		expect(entityB).not.toBe(entityA);
		await fixture.client.check({ command: checkOf({ featureId: "seats" }) });
		await fixture.client.check({ command: checkOf({ requiredBalance: 2 }) });
		await fixture.client.check({ command: checkOf({ customerId: "other" }) });
		await fixture.client.check({
			command: checkOf({ properties: { model: "large" } }),
		});
		await fixture.client.check({
			command: checkOf({ properties: { model: "large" } }),
		});
		expect(fixture.checksSent()).toBe(7);
		expect(
			await fixture.client.check({ command: checkOf({ entityId: "a" }) }),
		).toBe(entityA);
		expect(
			await fixture.client.check({ command: checkOf({ entityId: "b" }) }),
		).toBe(entityB);
		expect(fixture.checksSent()).toBe(7);
	});

	test("a track this server sends for the customer ends its leases, entities included", async () => {
		const fixture = createFixture();
		await fixture.client.check({ command: checkOf() });
		await fixture.client.check({ command: checkOf({ entityId: "a" }) });
		await fixture.client.check({ command: checkOf({ customerId: "other" }) });
		await fixture.client.track({ command: trackCommand });
		await fixture.client.check({ command: checkOf() });
		await fixture.client.check({ command: checkOf({ entityId: "a" }) });
		expect(fixture.checksSent()).toBe(5);
		await fixture.client.check({ command: checkOf({ customerId: "other" }) });
		expect(fixture.checksSent()).toBe(5);
	});

	test("a catalog change this server publishes ends every lease of the org", async () => {
		const fixture = createFixture();
		await fixture.client.check({ command: checkOf() });
		await fixture.client.check({ command: checkOf({ customerId: "other" }) });
		await fixture.client.catalog.invalidateOrgCatalog({
			orgId: "org",
			env: "sandbox",
		});
		expect(fixture.published).toEqual(["org"]);
		await fixture.client.check({ command: checkOf() });
		await fixture.client.check({ command: checkOf({ customerId: "other" }) });
		expect(fixture.checksSent()).toBe(4);
	});

	test("without the config every check asks the owner", async () => {
		const fixture = createFixture({ leases: false });
		await fixture.client.check({ command: checkOf() });
		await fixture.client.check({ command: checkOf() });
		expect(fixture.checksSent()).toBe(2);
		expect(fixture.client.readCheckLeaseCounters?.()).toBeNull();
	});
});

describe("createCheckLeases", () => {
	const createClock = (start = 1_000_000) => {
		let at = start;
		return {
			now: () => at,
			advance: (ms: number) => {
				at += ms;
			},
		};
	};

	const answerWith = ({
		leases,
		reply,
		command = checkOf(),
	}: {
		leases: ReturnType<typeof createCheckLeases>;
		reply: CheckReply;
		command?: CheckCommand;
	}) => leases.answer({ command, send: async () => reply });

	test("a lease answers until the owner's expiry, and never past maxTtlMs from the send", async () => {
		const clock = createClock();
		const leases = createCheckLeases({
			ctx: { now: clock.now },
			config: { maxEntries: 10, maxTtlMs: 1_000 },
		});
		const short = replyOf({ lease: { expiresAt: clock.now() + 300 } });
		await answerWith({ leases, reply: short });
		clock.advance(299);
		expect(await answerWith({ leases, reply: replyOf() })).toBe(short);
		clock.advance(1);
		expect(await answerWith({ leases, reply: replyOf() })).not.toBe(short);

		// An owner clock ahead of ours cannot stretch the answer past our own cap.
		const skewed = replyOf({ lease: { expiresAt: clock.now() + 60_000 } });
		await answerWith({
			leases,
			reply: skewed,
			command: checkOf({ requiredBalance: 3 }),
		});
		clock.advance(999);
		expect(
			await answerWith({
				leases,
				reply: replyOf(),
				command: checkOf({ requiredBalance: 3 }),
			}),
		).toBe(skewed);
		clock.advance(1);
		expect(
			await answerWith({
				leases,
				reply: replyOf(),
				command: checkOf({ requiredBalance: 3 }),
			}),
		).not.toBe(skewed);
	});

	test("a reply decided while a write was in flight is not held", async () => {
		const clock = createClock();
		const leases = createCheckLeases({
			ctx: { now: clock.now },
			config: { maxEntries: 10 },
		});
		const write = Promise.withResolvers<void>();
		const writing = leases.invalidating({
			identities: [identity],
			run: () => write.promise,
		});
		clock.advance(5);
		const during = replyOf({ lease: { expiresAt: clock.now() + 1_000 } });
		const answered = leases.answer({
			command: checkOf(),
			send: async () => {
				clock.advance(5);
				write.resolve();
				await writing;
				return during;
			},
		});
		expect(await answered).toBe(during);
		clock.advance(1);
		expect(await answerWith({ leases, reply: replyOf() })).not.toBe(during);
		expect(leases.readCounters()).toMatchObject({ leaseWithheld: 1 });
	});

	test("the LRU holds at most maxEntries, dropping the least recently used", async () => {
		const clock = createClock();
		const leases = createCheckLeases({
			ctx: { now: clock.now },
			config: { maxEntries: 2 },
		});
		const lease = () => ({ expiresAt: clock.now() + 1_000 });
		const one = replyOf({ lease: lease() });
		const two = replyOf({ lease: lease() });
		const three = replyOf({ lease: lease() });
		const commandOf = (requiredBalance: number) => checkOf({ requiredBalance });
		await answerWith({ leases, reply: one, command: commandOf(1) });
		await answerWith({ leases, reply: two, command: commandOf(2) });
		// Touching the first makes the second the least recently used.
		expect(
			await answerWith({ leases, reply: replyOf(), command: commandOf(1) }),
		).toBe(one);
		await answerWith({ leases, reply: three, command: commandOf(3) });
		expect(leases.readCounters()).toMatchObject({ size: 2, leaseEvicted: 1 });
		expect(
			await answerWith({ leases, reply: replyOf(), command: commandOf(1) }),
		).toBe(one);
		expect(
			await answerWith({ leases, reply: replyOf(), command: commandOf(3) }),
		).toBe(three);
		expect(
			await answerWith({ leases, reply: replyOf(), command: commandOf(2) }),
		).not.toBe(two);
	});
});

describe("leases shared across servers", () => {
	/** A Redis stand-in on a clock the servers share: values with a remaining life. */
	const createStore = ({ now }: { now: () => number }) => {
		const entries = new Map<string, { value: string; expiresAt: number }>();
		let reads = 0;
		const store: SharedCheckLeases = {
			read: async ({ key }) => {
				reads++;
				const entry = entries.get(key);
				if (!entry || entry.expiresAt <= now()) return null;
				return { value: entry.value, ttlMs: entry.expiresAt - now() };
			},
			write: async ({ key, value, ttlMs }) => {
				entries.set(key, { value, expiresAt: now() + ttlMs });
			},
		};
		return { store, entries, reads: () => reads };
	};
	const createClock = (start = 1_000_000) => {
		let at = start;
		return {
			now: () => at,
			advance: (ms: number) => {
				at += ms;
			},
		};
	};
	const serversOn = ({
		clock,
		store,
		count = 2,
	}: {
		clock: ReturnType<typeof createClock>;
		store: SharedCheckLeases;
		count?: number;
	}) =>
		Array.from({ length: count }, () =>
			createCheckLeases({
				ctx: { now: clock.now, shared: store },
				config: { maxEntries: 10 },
			}),
		);
	const leasedReply = (clock: ReturnType<typeof createClock>) =>
		replyOf({ lease: { expiresAt: clock.now() + 1_000 } });
	const owner = (reply: CheckReply) => {
		let calls = 0;
		return {
			send: async () => {
				calls++;
				return reply;
			},
			calls: () => calls,
		};
	};

	test("one owner call answers every server until the owner's deadline", async () => {
		const clock = createClock();
		const { store } = createStore({ now: clock.now });
		const [a, b] = serversOn({ clock, store });
		if (!a || !b) throw new Error("servers");
		const fromOwner = owner(leasedReply(clock));
		const first = await a.answer({ command: checkOf(), send: fromOwner.send });
		clock.advance(400);
		const onB = await b.answer({ command: checkOf(), send: fromOwner.send });
		expect(fromOwner.calls()).toBe(1);
		// The same body the owner sent, through the store.
		expect(JSON.stringify(onB)).toBe(JSON.stringify(first));
		expect(b.readCounters()).toMatchObject({ leaseSharedHit: 1, leaseMiss: 0 });
		// B now holds it locally, until the owner's deadline and no later.
		clock.advance(599);
		await b.answer({ command: checkOf(), send: fromOwner.send });
		expect(b.readCounters()).toMatchObject({ leaseHit: 1 });
		clock.advance(1);
		await b.answer({ command: checkOf(), send: fromOwner.send });
		expect(fromOwner.calls()).toBe(2);
	});

	test("a server that wrote to the customer does not answer from a lease asked before its write", async () => {
		const clock = createClock();
		const { store } = createStore({ now: clock.now });
		const [a, b] = serversOn({ clock, store });
		if (!a || !b) throw new Error("servers");
		const fromOwner = owner(leasedReply(clock));
		await a.answer({ command: checkOf(), send: fromOwner.send });
		clock.advance(200);
		await b.invalidating({
			identities: [identity],
			run: async () => undefined,
		});
		clock.advance(50);
		await b.answer({ command: checkOf(), send: fromOwner.send });
		expect(fromOwner.calls()).toBe(2);
		// B's fresh answer is published; A, which wrote nothing, reads its own.
		expect(a.readCounters()).toMatchObject({ leaseHit: 0 });
		const [c] = serversOn({ clock, store, count: 1 });
		clock.advance(SKEW_MS + 1);
		await c?.answer({ command: checkOf(), send: fromOwner.send });
		expect(fromOwner.calls()).toBe(2);
	});

	test("a refusal is never published, and a store failure goes to the owner", async () => {
		const clock = createClock();
		const { store, entries } = createStore({ now: clock.now });
		const [a] = serversOn({ clock, store, count: 1 });
		const refused = owner(replyOf({ allowed: false }));
		await a?.answer({ command: checkOf(), send: refused.send });
		expect(entries.size).toBe(0);

		const broken: SharedCheckLeases = {
			read: async () => {
				throw new Error("redis down");
			},
			write: async () => {
				throw new Error("redis down");
			},
		};
		const [down] = serversOn({ clock, store: broken, count: 1 });
		const fromOwner = owner(leasedReply(clock));
		await down?.answer({ command: checkOf(), send: fromOwner.send });
		await Promise.resolve();
		expect(fromOwner.calls()).toBe(1);
		expect(down?.readCounters()).toMatchObject({
			leaseMiss: 1,
			leaseIssued: 1,
			leaseSharedErrors: 2,
		});
	});

	test("a published lease never outlives the owner's deadline on a reader that took it late", async () => {
		const clock = createClock();
		const { store } = createStore({ now: clock.now });
		const [a, b] = serversOn({ clock, store });
		if (!a || !b) throw new Error("servers");
		const fromOwner = owner(
			replyOf({ lease: { expiresAt: clock.now() + 300 } }),
		);
		await a.answer({ command: checkOf(), send: fromOwner.send });
		clock.advance(250);
		await b.answer({ command: checkOf(), send: fromOwner.send });
		clock.advance(50);
		await b.answer({ command: checkOf(), send: fromOwner.send });
		expect(fromOwner.calls()).toBe(2);
	});
});
