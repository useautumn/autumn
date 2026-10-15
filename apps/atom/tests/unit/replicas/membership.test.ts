/**
 * The membership table the threads of one replica share, and the prober that fills it from the peers' readiness: who
 * counts as an owner, from which thread's handoff, and how a peer that came back at the same address is told apart.
 */
import { describe, expect, test } from "bun:test";
import { createReplicaRing } from "../../../src/replicas/createReplicaRing.js";
import {
	createMembership,
	MEMBERSHIP_INTS,
} from "../../../src/replicas/membership/createMembership.js";
import { startReadinessProber } from "../../../src/replicas/membership/startReadinessProber.js";

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
}: {
	membership: ReturnType<typeof createMembership>;
	thread: number;
	threads: number;
	listed: string[];
	health: typeof fetch;
	handedOff: string[];
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
						slots: { ownedHandoffs: async () => [] },
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
	test("the first thread to see it ready counts it, for every thread at once; then each thread hands over to it once", async () => {
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
		expect(membership.stateOf(A)).toBe("joined");
		expect(handedOff).toEqual([`t0:${A}`]);
		await t0.probeOnce();
		expect(handedOff).toEqual([`t0:${A}`]);
		await t1.probeOnce();

		expect(handedOff).toEqual([`t0:${A}`, `t1:${A}`]);
	});

	test("a thread that missed the peer's absence from the service name still hands over to the peer that came back: its boot is new", async () => {
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

	test("a leaving peer that still answers from its old boot is not counted again by a thread that never flipped it: the boot is read from the shared table", async () => {
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

describe("a peer that counts this replica as an owner", () => {
	test("grants it with its joining announcement, hands over from each of its threads, and the handoff is complete once every one has", () => {
		const membership = createMembership({ self: B });
		expect(membership.isGrantedBy(A)).toBe(false);

		membership.grantedBy(A);

		expect(membership.isGrantedBy(A)).toBe(true);
		expect(membership.isHanding(A)).toBe(true);
		expect(membership.isHandoffComplete(A)).toBe(false);
		expect(
			membership.handoffCompleted({ address: A, thread: 1, threads: 2 }),
		).toBe(false);
		// Told twice by one thread, as a retried announcement is: still one thread.
		expect(
			membership.handoffCompleted({ address: A, thread: 1, threads: 2 }),
		).toBe(false);
		expect(membership.isHanding(A)).toBe(true);
		expect(
			membership.handoffCompleted({ address: A, thread: 0, threads: 2 }),
		).toBe(true);
		expect(membership.isHanding(A)).toBe(false);
		expect(membership.isHandoffComplete(A)).toBe(true);
	});

	test("keeps the grant when the peer leaves and comes back: its new boot hands over again before it counts", () => {
		const membership = createMembership({ self: B });
		membership.grantedBy(A);
		membership.handoffCompleted({ address: A, thread: 0, threads: 1 });
		membership.markJoined({ address: A, boot: "boot-1" });
		membership.markLeaving(A);
		expect(membership.isHandoffComplete(A)).toBe(false);
		membership.handoffCompleted({ address: A, thread: 0, threads: 1 });

		membership.grantedBy(A);
		membership.markJoined({ address: A, boot: "boot-2" });

		expect(membership.isGrantedBy(A)).toBe(true);
		expect(membership.isHanding(A)).toBe(true);
		expect(membership.isHandoffComplete(A)).toBe(false);
		expect(membership.isBootOf({ address: A, boot: "boot-2" })).toBe(true);
	});
});
