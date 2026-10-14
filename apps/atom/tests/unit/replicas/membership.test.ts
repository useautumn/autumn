/**
 * The membership table the threads of one replica share, and the prober that fills it from the peers' readiness: who
 * counts as an owner, from which thread's handoff, and how a peer that came back at the same address is told apart.
 */
import { describe, expect, test } from "bun:test";
import { createReplicaRing } from "../../../src/replicas/createReplicaRing.js";
import { PEER_HANDOFF_PATH } from "../../../src/replicas/handover/handoffContract.js";
import {
	createMembership,
	MEMBERSHIP_INTS,
} from "../../../src/replicas/membership/createMembership.js";
import { startReadinessProber } from "../../../src/replicas/membership/startReadinessProber.js";
import {
	createOpenLocks,
	type OpenLocks,
} from "../../../src/state/openLocks/createOpenLocks.js";
import { until } from "../utils/fakeAutumnTracks.js";

const A = "10.0.0.1";
const B = "10.0.0.2";
const quiet = { info() {}, warn() {} };

/** A peer's /health as the prober reads it: ready with a boot, not ready, or unreachable. */
const healthOf = (
	replies: Record<string, { status: number; bootedAt: string } | null>,
) =>
	(async (input: URL | RequestInfo) => {
		const peer = new URL(String(input)).hostname;
		const reply = replies[peer];
		if (!reply) throw new TypeError("connect ECONNREFUSED");
		return Response.json(
			{ bootedAt: reply.bootedAt },
			{ status: reply.status },
		);
	}) as typeof fetch;

const proberOf = ({
	membership,
	thread,
	threads,
	listed,
	health,
	handedOff,
	openLocks = [],
}: {
	membership: ReturnType<typeof createMembership>;
	thread: number;
	threads: number;
	listed: string[];
	health: typeof fetch;
	handedOff: string[];
	/** The thread's slots' open-lock stores, as the handoff reads them. */
	openLocks?: OpenLocks[];
}) =>
	startReadinessProber({
		ctx: {
			ring: createReplicaRing({
				ctx: {
					resolver: { peers: async () => listed },
					own: () => [B],
					membership,
				},
			}),
			membership,
			replication: { peers: async () => listed },
			folders: {
				all: () => [
					{
						atomId: null,
						slots: {
							ownedJournals: () => [
								{
									handoffs: async () => [],
									dropHandedOff() {},
									keysSince: async () => [],
								},
							],
							ownedOpenLocks: () => openLocks,
						},
					},
				],
			} as never,
			threads,
			thread,
			publicPort: 8001,
			peer: { port: 8002, secret: "s".repeat(64), fetch: health },
			logger: quiet,
			onHandedOff: (peer: string) => handedOff.push(`t${thread}:${peer}`),
		},
	});

describe("a listed peer becomes an owner", () => {
	test("once every thread of this replica has handed it its customers' entries, each thread once", async () => {
		const membership = createMembership({ self: B });
		const handedOff: string[] = [];
		const health = healthOf({ [A]: { status: 200, bootedAt: "boot-1" } });
		const t0 = proberOf({
			membership,
			thread: 0,
			threads: 2,
			listed: [A],
			health,
			handedOff,
		});
		const t1 = proberOf({
			membership,
			thread: 1,
			threads: 2,
			listed: [A],
			health,
			handedOff,
		});

		await t0.probeOnce();
		expect(membership.stateOf(A)).toBe("ready");
		await t0.probeOnce();
		expect(membership.stateOf(A)).toBe("ready");
		await t1.probeOnce();

		expect(membership.stateOf(A)).toBe("joined");
		expect(handedOff).toEqual([`t0:${A}`, `t1:${A}`]);
	});

	test("a thread that missed the peer's absence from the service name still hands off to the peer that came back: its boot is new", async () => {
		const membership = createMembership({ self: B });
		const handedOff: string[] = [];
		const first = healthOf({ [A]: { status: 200, bootedAt: "boot-1" } });
		const t0 = proberOf({
			membership,
			thread: 0,
			threads: 1,
			listed: [A],
			health: first,
			handedOff,
		});
		await t0.probeOnce();
		expect(membership.stateOf(A)).toBe("joined");
		// A announces it is leaving, drains (still answering /health 200 with its old boot), then comes back at the same address.
		membership.markLeaving(A);
		await t0.probeOnce();
		expect(membership.stateOf(A)).toBe("leaving");

		const back = healthOf({ [A]: { status: 200, bootedAt: "boot-2" } });
		const again = proberOf({
			membership,
			thread: 0,
			threads: 1,
			listed: [A],
			health: back,
			handedOff,
		});
		await again.probeOnce();

		expect(membership.stateOf(A)).toBe("joined");
		expect(handedOff).toEqual([`t0:${A}`, `t0:${A}`]);
	});

	test("a thread that finished handing off keeps handing the locks it takes for the moving customers until every thread has, and the peer is counted only then", async () => {
		const table = new Int32Array(MEMBERSHIP_INTS);
		const onT0 = createMembership({ self: B, table });
		const onT1 = createMembership({ self: B, table });
		const handedOff: string[] = [];
		const locksOnT0 = createOpenLocks();
		const lockOf = (lockId: string) =>
			({
				track: { identity: { customerId: "cus_1" }, lock: { lockId } },
				row: { lock_id: lockId },
			}) as never;
		/** Every lock id t0 handed A, in order, and how long t1's one batch is held on the wire. */
		const handedLockIds: string[] = [];
		const health = healthOf({ [A]: { status: 200, bootedAt: "boot-1" } });
		const peerFetch =
			(thread: number) =>
			async (input: URL | RequestInfo, init?: RequestInit) => {
				const url = new URL(String(input));
				if (url.pathname !== PEER_HANDOFF_PATH) return health(input, init);
				if (thread === 1) await Bun.sleep(60);
				const body = JSON.parse(String(init?.body)) as {
					handoffs: { locks: { row: { lock_id: string } }[] }[];
				};
				for (const { locks } of body.handoffs)
					for (const { row } of locks) handedLockIds.push(row.lock_id);
				return Response.json({ held: 0 });
			};
		locksOnT0.hold(lockOf("lock_before"));
		const locksOnT1 = createOpenLocks();
		locksOnT1.hold(lockOf("lock_on_t1"));
		const t0 = proberOf({
			membership: onT0,
			thread: 0,
			threads: 2,
			listed: [A],
			health: peerFetch(0) as typeof fetch,
			handedOff,
			openLocks: [locksOnT0],
		});
		const t1 = proberOf({
			membership: onT1,
			thread: 1,
			threads: 2,
			listed: [A],
			health: peerFetch(1) as typeof fetch,
			handedOff,
			openLocks: [locksOnT1],
		});

		const probing = Promise.all([t0.probeOnce(), t1.probeOnce()]);
		// t0's batch landed at once; t1's is still on the wire, so B still owns cus_1 and t0 takes another lock for it.
		await until(() => handedLockIds.includes("lock_before"));
		expect(onT0.isMember(A)).toBe(false);
		locksOnT0.hold(lockOf("lock_meanwhile"));
		await probing;
		await until(() => handedLockIds.length === 3);

		expect(onT0.isMember(A)).toBe(true);
		expect(handedLockIds).toEqual([
			"lock_before",
			"lock_meanwhile",
			"lock_on_t1",
		]);
		t0.stop();
		t1.stop();
	});

	test("a leaving peer that still answers from its old boot is not counted again by a thread that never marked it ready: the boot is read from the shared table", async () => {
		// Two threads, one table: as deployed, each thread holds its own membership over the shared Int32Array.
		const table = new Int32Array(MEMBERSHIP_INTS);
		const onT0 = createMembership({ self: B, table });
		const onT1 = createMembership({ self: B, table });
		const handedOff: string[] = [];
		const health = healthOf({ [A]: { status: 200, bootedAt: "boot-1" } });
		const t0 = proberOf({
			membership: onT0,
			thread: 0,
			threads: 2,
			listed: [A],
			health,
			handedOff,
		});
		const t1 = proberOf({
			membership: onT1,
			thread: 1,
			threads: 2,
			listed: [A],
			health,
			handedOff,
		});
		await t0.probeOnce();
		await t1.probeOnce();
		expect(onT1.stateOf(A)).toBe("joined");
		onT1.markLeaving(A);

		// A drains, still answering /health 200 from boot-1; both threads probe it.
		await t0.probeOnce();
		await t1.probeOnce();

		expect(onT0.stateOf(A)).toBe("leaving");
		expect(onT1.stateOf(A)).toBe("leaving");
		expect(handedOff).toHaveLength(2);
	});

	test("a leaving peer that still answers from its old boot is not counted again", async () => {
		const membership = createMembership({ self: B });
		const handedOff: string[] = [];
		const health = healthOf({ [A]: { status: 200, bootedAt: "boot-1" } });
		const t0 = proberOf({
			membership,
			thread: 0,
			threads: 1,
			listed: [A],
			health,
			handedOff,
		});
		await t0.probeOnce();
		membership.markLeaving(A);

		await t0.probeOnce();
		await t0.probeOnce();

		expect(membership.stateOf(A)).toBe("leaving");
		expect(handedOff).toHaveLength(1);
	});
});
