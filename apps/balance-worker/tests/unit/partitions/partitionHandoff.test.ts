import { describe, expect, test } from "bun:test";
import { createStandbyPreparations } from "../../../src/blueGreen/createStandbyPreparations.js";
import { StateAheadOfKafkaLogEndError } from "../../../src/kafka/meteringConsumer/meteringErrors.js";
import type { PartitionsDependencies } from "../../../src/partitions/types/partitions.js";
import {
	OwnedPartitionRecoveryRequiredError,
	PartitionPreparationFailedError,
} from "../../../src/runtime/runtimeErrors.js";
import {
	createOwnershipLog,
	createWorker,
	deferred,
	latestClaim,
	ownAlone,
	preparesOf,
	settle,
	waitFor,
} from "./handoffFixtures.js";

describe("standby preparation limit", () => {
	const holdReady: PartitionsDependencies["awaitReadyAnnouncement"] = ({
		signal,
	}) =>
		new Promise((_resolve, reject) =>
			signal.addEventListener("abort", () => reject(signal.reason), {
				once: true,
			}),
		);

	test("a standby worker prepares its partitions one at a time and still prepares them all", async () => {
		const log = createOwnershipLog();
		const prepare = deferred();
		const standby = createStandbyPreparations({
			ctx: {
				gate: { isActive: () => false, subscribe: () => () => undefined },
			},
			config: { concurrency: 1 },
		});
		const B = createWorker({
			name: "B",
			log,
			prepareGate: prepare.promise,
			awaitReadyAnnouncement: holdReady,
			acquirePreparation: standby.acquire,
		});
		try {
			await B.ownership.start();
			B.assign([1, 2, 3]);
			await waitFor(() => preparesOf(B) === 1);
			await settle();
			expect(preparesOf(B)).toBe(1);

			prepare.resolve();
			await waitFor(() =>
				[1, 2, 3].every((partition) => B.status(partition) === "prepared"),
			);
			expect(preparesOf(B)).toBe(3);
			expect(B.errors).toEqual([]);
		} finally {
			prepare.resolve();
			await B.ownership.stop();
		}
	});

	test("a live worker taking over partitions prepares them all at once", async () => {
		const log = createOwnershipLog();
		const prepare = deferred();
		const live = createStandbyPreparations({
			ctx: { gate: { isActive: () => true, subscribe: () => () => undefined } },
			config: { concurrency: 1 },
		});
		const A = createWorker({
			name: "A",
			log,
			prepareGate: prepare.promise,
			acquirePreparation: live.acquire,
		});
		try {
			await A.ownership.start();
			A.assign([1, 2, 3]);
			await waitFor(() => preparesOf(A) === 3);

			prepare.resolve();
			await waitFor(() =>
				[1, 2, 3].every((partition) => A.status(partition) === "ready"),
			);
			expect(A.errors).toEqual([]);
		} finally {
			prepare.resolve();
			await A.ownership.stop();
		}
	});

	test("a standby partition revoked while it waits for its turn retires without preparing", async () => {
		const log = createOwnershipLog();
		const prepare = deferred();
		const standby = createStandbyPreparations({
			ctx: {
				gate: { isActive: () => false, subscribe: () => () => undefined },
			},
			config: { concurrency: 1 },
		});
		const B = createWorker({
			name: "B",
			log,
			prepareGate: prepare.promise,
			awaitReadyAnnouncement: holdReady,
			acquirePreparation: standby.acquire,
		});
		try {
			await B.ownership.start();
			B.assign([1, 2]);
			await waitFor(() => preparesOf(B) === 1);
			B.revoke();
			prepare.resolve();
			await waitFor(() => B.has("stop:1") && B.has("stop:2"));
			expect(preparesOf(B)).toBe(1);
		} finally {
			prepare.resolve();
			await B.ownership.stop();
		}
	});
});

describe("partition handoff", () => {
	test("the successor never fences before the predecessor has drained", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const A = createWorker({ name: "A", log, drainGate: drain.promise });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			const held = A.ownership.findRuntime({ partition: 2, routeEpoch: "101" });
			expect(held).toBeDefined();

			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.has("announce:2"));
			await waitFor(() => A.has("withdraw:2"));
			await settle();

			// A is still draining: B has been assigned for a while but must not fence.
			expect(A.has("drained:2")).toBe(false);
			expect(B.has("activate:2")).toBe(false);
			expect(B.status(2)).toBe("prepared");
			expect(
				A.ownership.findRuntime({ partition: 2, routeEpoch: "101" }),
			).toBeUndefined();

			drain.resolve();
			await waitFor(() => B.status(2) === "ready");

			expect(A.index("drained:2")).toBeLessThan(A.index("claim:B:2"));
			expect(A.index("claim:B:2")).toBeLessThan(B.index("activate:2"));
			expect(A.has("release:2")).toBe(false);
			const claim = log.records.find(
				(event) => event.type === "claimed" && event.endpoint === B.endpoint,
			);
			expect(claim?.type).toBe("claimed");
			if (claim?.type !== "claimed") throw new Error("unreachable");
			expect(
				B.ownership.findRuntime({ partition: 2, routeEpoch: claim.routeEpoch }),
			).toBeDefined();
			await waitFor(() => A.has("stop:2"));
			expect(A.errors).toEqual([]);
			expect(B.errors).toEqual([]);
		} finally {
			drain.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a request meeting a withdrawn route waits until the successor is named", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const A = createWorker({ name: "A", log, drainGate: drain.promise });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => A.has("withdraw:2"));

			let settled = false;
			const waiting = A.ownership.awaitHandoff({ partition: 2 }).then(() => {
				settled = true;
			});
			await settle();
			expect(settled).toBe(false);
			drain.resolve();
			await waiting;
			expect(A.has("claim:B:2")).toBe(true);
			// The route it claimed for the successor is what a caller meeting the withdrawn route is told to try.
			expect(A.ownership.findSuccessor({ partition: 2 })).toEqual({
				partition: 2,
				endpoint: "http://B",
				routeEpoch: expect.any(String),
			});
			expect(A.ownership.findSuccessor({ partition: 9 })).toBeUndefined();
			// Nothing to wait for once the successor is named, or on a partition that is not mid-handoff.
			await A.ownership.awaitHandoff({ partition: 2 });
			await A.ownership.awaitHandoff({ partition: 9 });
		} finally {
			drain.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a successor that announced it is preparing is waited for past the ready timeout", async () => {
		// Run 60 on staging: a grow put the partition on an idle worker whose preparation outran the
		// old owner's 5 s wait, the old owner released, and nobody owned the partition for 8 s.
		const log = createOwnershipLog();
		const prepare = deferred();
		const A = createWorker({
			name: "A",
			log,
			config: { handoffReadyTimeoutMs: 20, handoffDrainCapMs: 5_000 },
		});
		const B = createWorker({ name: "B", log, prepareGate: prepare.promise });
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.has("preparing:2"));
			// Well past the ready timeout: A heard B preparing, keeps serving, and has not released.
			await Bun.sleep(60);
			expect(A.has("release:2")).toBe(false);
			expect(A.has("withdraw:2")).toBe(false);
			expect(A.status(2)).toBe("ready");

			prepare.resolve();
			await waitFor(() => B.status(2) === "ready");
			expect(A.has("release:2")).toBe(false);
			expect(A.index("withdraw:2")).toBeLessThan(A.index("claim:B:2"));
			expect(B.has("claim:B:2")).toBe(false);
			expect(A.errors).toEqual([]);
			expect(B.errors).toEqual([]);
		} finally {
			prepare.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a preparation that never becomes ready keeps the predecessor serving past the drain cap", async () => {
		const log = createOwnershipLog();
		const prepare = deferred();
		const A = createWorker({
			name: "A",
			log,
			config: { handoffReadyTimeoutMs: 20, handoffDrainCapMs: 60 },
		});
		const B = createWorker({ name: "B", log, prepareGate: prepare.promise });
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.has("preparing:2"));
			await Bun.sleep(150);
			expect(A.has("withdraw:2")).toBe(false);
			expect(A.has("release:2")).toBe(false);
			expect(A.status(2)).toBe("ready");

			prepare.resolve();
			await waitFor(() => B.status(2) === "ready");
			expect(A.index("withdraw:2")).toBeLessThan(A.index("claim:B:2"));
			expect(A.has("release:2")).toBe(false);
			expect(A.errors).toEqual([]);
			expect(B.errors).toEqual([]);
		} finally {
			prepare.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("no successor in time: the predecessor keeps serving until one is ready", async () => {
		const log = createOwnershipLog();
		const A = createWorker({
			name: "A",
			log,
			config: { handoffReadyTimeoutMs: 20 },
		});
		const B = createWorker({ name: "B", log });
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await Bun.sleep(100);
			expect(A.has("withdraw:2")).toBe(false);
			expect(A.has("release:2")).toBe(false);
			expect(A.status(2)).toBe("ready");
			expect(
				A.ownership.findRuntime({ partition: 2, routeEpoch: "101" }),
			).toBeDefined();

			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.status(2) === "ready");
			expect(A.index("withdraw:2")).toBeLessThan(A.index("drained:2"));
			expect(A.index("drained:2")).toBeLessThan(A.index("claim:B:2"));
			expect(A.has("release:2")).toBe(false);
			expect(A.errors).toEqual([]);
			expect(B.errors).toEqual([]);
		} finally {
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a partition whose runtime fails while it waits for a successor is withdrawn and released at once", async () => {
		const log = createOwnershipLog();
		const A = createWorker({
			name: "A",
			log,
			config: { handoffReadyTimeoutMs: 60_000 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await settle();
			expect(A.has("withdraw:2")).toBe(false);
			A.fail(2);
			await waitFor(() => A.has("release:2"));
			expect(A.index("withdraw:2")).toBeLessThan(A.index("release:2"));
			expect(
				A.ownership.findRuntime({ partition: 2, routeEpoch: "101" }),
			).toBeUndefined();
			await waitFor(() => A.has("stop:2"));
		} finally {
			await A.ownership.stop();
		}
	});

	test("a stopping worker with no successor still releases at the ready timeout", async () => {
		const log = createOwnershipLog();
		const A = createWorker({
			name: "A",
			log,
			config: { handoffReadyTimeoutMs: 20 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await Bun.sleep(60);
			expect(A.has("release:2")).toBe(false);
			await A.ownership.stop();
			expect(A.index("withdraw:2")).toBeLessThan(A.index("drained:2"));
			expect(A.index("drained:2")).toBeLessThan(A.index("release:2"));
			expect(A.has("stop:2")).toBe(true);
			expect(A.errors).toEqual([]);
		} finally {
			await A.ownership.stop();
		}
	});

	test("no claim in time: the successor claims for itself after activating", async () => {
		const log = createOwnershipLog();
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 20 },
		});
		try {
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.has("announce:2"));
			await settle();
			expect(B.has("activate:2")).toBe(false);
			await waitFor(() => B.status(2) === "ready");
			expect(B.index("announce:2")).toBeLessThan(B.index("activate:2"));
			expect(B.index("activate:2")).toBeLessThan(B.index("claim:B:2"));
			expect(
				B.ownership.findRuntime({ partition: 2, routeEpoch: "101" }),
			).toBeDefined();
			expect(B.errors).toEqual([]);
		} finally {
			await B.ownership.stop();
		}
	});

	test("a predecessor that already released lets the successor claim at once instead of waiting out the claim timeout", async () => {
		const log = createOwnershipLog();
		const A = createWorker({
			name: "A",
			log,
			config: { handoffReadyTimeoutMs: 60_000 },
		});
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 60_000 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			A.fail(2);
			await waitFor(() => A.has("release:2"));

			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.status(2) === "ready");
			expect(B.index("announce:2")).toBeLessThan(B.index("claim:B:2"));
			expect(B.errors).toEqual([]);
		} finally {
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a predecessor that releases while the successor waits lets it claim at once", async () => {
		const log = createOwnershipLog();
		const A = createWorker({
			name: "A",
			log,
			deaf: true,
			config: { handoffReadyTimeoutMs: 60_000 },
		});
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 60_000 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.has("announce:2"));
			await settle();
			expect(B.has("activate:2")).toBe(false);

			A.fail(2);
			await waitFor(() => B.status(2) === "ready");
			expect(A.index("release:2")).toBeLessThan(B.index("claim:B:2"));
			expect(B.errors).toEqual([]);
		} finally {
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a slow predecessor that announced draining is not fenced by the claim timeout", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const A = createWorker({ name: "A", log, drainGate: drain.promise });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 20, handoffDrainCapMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => A.has("draining:2"));
			expect(A.index("withdraw:2")).toBeLessThan(A.index("draining:2"));
			// Well past the claim timeout: B heard A draining and keeps waiting.
			await Bun.sleep(60);
			expect(B.has("activate:2")).toBe(false);
			expect(B.status(2)).toBe("prepared");

			drain.resolve();
			await waitFor(() => B.status(2) === "ready");
			expect(A.index("drained:2")).toBeLessThan(A.index("claim:B:2"));
			expect(A.index("claim:B:2")).toBeLessThan(B.index("activate:2"));
			expect(B.has("claim:B:2")).toBe(false);
			expect(A.errors).toEqual([]);
			expect(B.errors).toEqual([]);
		} finally {
			drain.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("the partition moves on mid-drain: the replacement waits out the drain, then claims after silence", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const A = createWorker({ name: "A", log, drainGate: drain.promise });
		const B = createWorker({ name: "B", log });
		const C = createWorker({
			name: "C",
			log,
			config: { handoffClaimTimeoutMs: 20, handoffDrainCapMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			// B is chosen, then the roster moves the partition on to C before A finishes.
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => A.has("draining:2"));
			B.revoke();
			await C.ownership.start();
			C.assign([2]);
			await waitFor(() => C.has("announce:2"));
			// A's drain names B, but A still owns the partition: C must not fence it at its own timeout.
			await Bun.sleep(60);
			expect(C.has("activate:2")).toBe(false);
			expect(C.has("claim:C:2")).toBe(false);

			// A finishes and names B, who is gone. Silence follows, so C claims for itself.
			drain.resolve();
			await waitFor(() => A.has("claim:B:2"));
			await waitFor(() => C.has("claim:C:2"));
			expect(A.index("drained:2")).toBeLessThan(C.index("claim:C:2"));
			expect(B.has("activate:2")).toBe(false);
			expect(C.errors).toEqual([]);
		} finally {
			drain.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
			await C.ownership.stop();
		}
	});

	test("a late draining record from a past owner does not hold the next successor", async () => {
		const log = createOwnershipLog();
		const A = createWorker({ name: "A", log });
		const B = createWorker({ name: "B", log, deaf: true });
		const C = createWorker({
			name: "C",
			log,
			config: { handoffClaimTimeoutMs: 20, handoffDrainCapMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.status(2) === "ready");
			// B owns it and never answers (deaf to C's ready, standing in for a dead owner).
			await C.ownership.start();
			C.assign([2]);
			await waitFor(() => C.has("announce:2"));
			const announcedAt = Date.now();
			// A's drain record lands late: A is a past owner, so it says nothing about B being alive.
			log.publish({
				type: "draining",
				partition: 2,
				endpoint: "http://A",
				successor: "http://B",
			});
			await waitFor(() => C.has("claim:C:2"));
			// Silence timeout, not the drain cap.
			expect(Date.now() - announcedAt).toBeLessThan(1_000);
			expect(C.errors).toEqual([]);
		} finally {
			await A.ownership.stop();
			await B.ownership.stop();
			await C.ownership.stop();
		}
	});

	test("a slow draining send does not hold the drain or the claim", async () => {
		const log = createOwnershipLog();
		const send = deferred();
		const A = createWorker({
			name: "A",
			log,
			announceDrainingGate: send.promise,
		});
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			// The send never completes, yet A drains and names B regardless.
			await waitFor(() => B.status(2) === "ready");
			expect(A.index("drained:2")).toBeLessThan(A.index("claim:B:2"));
			expect(B.has("claim:B:2")).toBe(false);
			expect(A.errors).toEqual([]);
		} finally {
			send.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a drain the store refused names no successor; the successor claims for itself", async () => {
		const log = createOwnershipLog();
		const refused = Promise.reject(new Error("store refused the apply"));
		void refused.catch(() => undefined);
		const A = createWorker({ name: "A", log, drainGate: refused });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 20, handoffDrainCapMs: 40 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => A.has("stop:2"));
			expect(A.has("claim:B:2")).toBe(false);
			expect(A.has("release:2")).toBe(false);
			expect(
				log.records.some(
					(event) => event.type === "claimed" && event.endpoint === B.endpoint,
				),
			).toBe(false);
			await waitFor(() => B.status(2) === "ready", 1_000);
			expect(B.has("claim:B:2")).toBe(true);
		} finally {
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("the drain cap bounds how long a draining predecessor can hold the successor", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const A = createWorker({ name: "A", log, drainGate: drain.promise });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 20, handoffDrainCapMs: 100 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => A.has("draining:2"));
			await Bun.sleep(50);
			expect(B.status(2)).toBe("prepared");
			// The predecessor never finishes: past the cap the successor claims for itself, as it would in silence.
			await waitFor(() => B.status(2) === "ready", 1_000);
			expect(B.index("activate:2")).toBeLessThan(B.index("claim:B:2"));
			expect(A.has("claim:B:2")).toBe(false);
			expect(B.errors).toEqual([]);
		} finally {
			drain.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a handoff claim landing after the successor claimed for itself is the route it serves", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const send = deferred();
		const prepare = deferred();
		const A = createWorker({
			name: "A",
			log,
			config: { handoffReadyTimeoutMs: 20 },
			drainGate: drain.promise,
			announceDrainingGate: send.promise,
		});
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 20 },
			prepareGate: prepare.promise,
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			// B is ready only after A's ready timeout, so A hands off to it instead of releasing.
			await Bun.sleep(60);
			prepare.resolve();
			// A's draining record is slow and its drain outlasts B's silence: B claims for itself.
			await waitFor(() => B.has("claim:B:2"));
			await waitFor(() => B.status(2) === "ready");

			drain.resolve();
			send.resolve();
			await waitFor(() => A.has("claim:B:2"));
			await settle();

			// Servers route by the newest claim; both name B, so B must admit the newest.
			const route = latestClaim({ log, partition: 2 });
			expect(route?.endpoint).toBe(B.endpoint);
			expect(
				B.ownership.findRuntime({
					partition: 2,
					routeEpoch: route?.routeEpoch ?? "",
				}),
			).toBeDefined();
			expect(B.errors).toEqual([]);
		} finally {
			drain.resolve();
			send.resolve();
			prepare.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a drain that finishes past the drain cap does not leave the successor on an older route", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const A = createWorker({ name: "A", log, drainGate: drain.promise });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 20, handoffDrainCapMs: 40 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.has("claim:B:2"), 1_000);
			await waitFor(() => B.status(2) === "ready");

			drain.resolve();
			await waitFor(() => A.has("claim:B:2"));
			await settle();

			const route = latestClaim({ log, partition: 2 });
			expect(route?.endpoint).toBe(B.endpoint);
			expect(
				B.ownership.findRuntime({
					partition: 2,
					routeEpoch: route?.routeEpoch ?? "",
				}),
			).toBeDefined();
		} finally {
			drain.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a handoff claim landing while the successor fences its own claim is the route it serves", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const fence = deferred();
		const A = createWorker({ name: "A", log, drainGate: drain.promise });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 20, handoffDrainCapMs: 40 },
			fenceGate: fence.promise,
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.has("fence:2"), 1_000);

			drain.resolve();
			await waitFor(() => A.has("claim:B:2"));
			fence.resolve();
			await waitFor(() => B.ownership.isAdmitted({ partition: 2 }));

			const route = latestClaim({ log, partition: 2 });
			expect(route?.endpoint).toBe(B.endpoint);
			expect(
				B.ownership.findRuntime({
					partition: 2,
					routeEpoch: route?.routeEpoch ?? "",
				}),
			).toBeDefined();
		} finally {
			drain.resolve();
			fence.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("an older claim delivered after a newer one does not move the admitted route back", async () => {
		const log = createOwnershipLog();
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 20 },
		});
		try {
			await ownAlone(B, [2]);
			const admitted = latestClaim({ log, partition: 2 });
			log.publish({
				type: "claimed",
				partition: 2,
				endpoint: B.endpoint,
				routeEpoch: "50",
			});
			await settle();
			expect(
				B.ownership.findRuntime({
					partition: 2,
					routeEpoch: admitted?.routeEpoch ?? "",
				}),
			).toBeDefined();
			expect(
				B.ownership.findRuntime({ partition: 2, routeEpoch: "50" }),
			).toBeUndefined();
		} finally {
			await B.ownership.stop();
		}
	});

	test("A→A: a partition assigned back cancels its handoff and never bounces", async () => {
		const log = createOwnershipLog();
		const A = createWorker({
			name: "A",
			log,
			config: { handoffReadyTimeoutMs: 20 },
		});
		try {
			await ownAlone(A, [1, 2]);
			const before = A.events.length;
			A.revoke();
			A.assign([2]);
			await Bun.sleep(40);
			expect(A.status(2)).toBe("ready");
			expect(
				A.ownership.findRuntime({ partition: 2, routeEpoch: "102" }),
			).toBeDefined();
			expect(A.events.slice(before).filter((e) => e.endsWith(":2"))).toEqual(
				[],
			);
			// The kept partition is not paused again: its follower keeps its position.
			expect(A.pauses).toEqual(["metering:1,2", "commands:1,2"]);
			expect(A.has("release:1")).toBe(false);
			expect(A.status(1)).toBe("ready");
			expect(A.ownership.partitions().map((h) => h.partition)).toEqual([1, 2]);

			A.revoke();
			A.assign([]);
			await Bun.sleep(40);
			expect(A.has("release:2")).toBe(false);
			await A.ownership.stop();
			expect(A.has("release:1")).toBe(true);
			expect(A.has("release:2")).toBe(true);
			expect(A.errors).toEqual([]);
		} finally {
			await A.ownership.stop();
		}
	});

	test("A→A: a partition already withdrawn finishes retiring before it starts afresh", async () => {
		const log = createOwnershipLog();
		const drain = deferred();
		const A = createWorker({
			name: "A",
			log,
			config: { handoffReadyTimeoutMs: 1, handoffClaimTimeoutMs: 20 },
			drainGate: drain.promise,
		});
		const B = createWorker({ name: "B", log });
		try {
			await ownAlone(A, [2]);
			A.revoke();
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => A.has("withdraw:2"));
			B.revoke();
			A.assign([2]);
			await settle();
			expect(A.events.filter((e) => e === "A:prepare:2")).toHaveLength(1);
			drain.resolve();
			await waitFor(
				() => A.events.filter((e) => e === "A:prepare:2").length === 2,
			);
			expect(A.index("stop:2")).toBeLessThan(
				A.events.lastIndexOf("A:prepare:2"),
			);
			await waitFor(() => A.status(2) === "ready");
			expect(A.errors).toEqual([]);
		} finally {
			drain.resolve();
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("service stop leaves the group first and serves until the successor is ready", async () => {
		const log = createOwnershipLog();
		const A = createWorker({ name: "A", log });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			const stopping = A.ownership.stop();
			await settle();
			expect(A.has("consumer-stop")).toBe(true);
			expect(A.status(2)).toBe("ready");
			expect(
				A.ownership.findRuntime({ partition: 2, routeEpoch: "101" }),
			).toBeDefined();

			await B.ownership.start();
			B.assign([2]);
			await stopping;
			expect(A.index("consumer-stop")).toBeLessThan(A.index("withdraw:2"));
			expect(A.index("drained:2")).toBeLessThan(A.index("claim:B:2"));
			expect(A.index("claim:B:2")).toBeLessThan(B.index("activate:2"));
			expect(A.has("release:2")).toBe(false);
			await waitFor(() => B.status(2) === "ready");
			expect(A.errors).toEqual([]);
			expect(B.errors).toEqual([]);
		} finally {
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("the ready announcement waits for the policy hook", async () => {
		const log = createOwnershipLog();
		const release = deferred();
		const B = createWorker({
			name: "B",
			log,
			awaitReadyAnnouncement: () => release.promise,
		});
		try {
			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.status(2) === "prepared");
			await settle();
			expect(B.has("announce:2")).toBe(false);
			release.resolve();
			await waitFor(() => B.has("announce:2"));
			expect(B.index("prepare:2")).toBeLessThan(B.index("announce:2"));
		} finally {
			release.resolve();
			await B.ownership.stop();
		}
	});

	test("an admitted owner hands off to a successor that announces ready, with no revoke of its own", async () => {
		// Two fleets, two rosters: green is assigned the partition by its own group while blue keeps it in its group.
		const log = createOwnershipLog();
		const slotFlip = deferred();
		const blue = createWorker({ name: "A", log });
		const green = createWorker({
			name: "B",
			log,
			awaitReadyAnnouncement: () => slotFlip.promise,
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(blue, [2]);
			await green.ownership.start();
			green.assign([2]);
			await waitFor(() => green.status(2) === "prepared");
			await settle();
			expect(blue.has("withdraw:2")).toBe(false);
			expect(blue.status(2)).toBe("ready");

			slotFlip.resolve();
			await waitFor(() => green.status(2) === "ready");
			expect(blue.index("withdraw:2")).toBeLessThan(blue.index("drained:2"));
			expect(blue.index("drained:2")).toBeLessThan(blue.index("claim:B:2"));
			expect(blue.index("claim:B:2")).toBeLessThan(green.index("activate:2"));
			expect(blue.has("release:2")).toBe(false);
			expect(green.has("claim:B:2")).toBe(false);
			// Blue's roster still deals it the partition, so blue itself stops fetching its commands.
			expect(blue.pauses).toContain("commands:2");
			await waitFor(() => blue.has("stop:2"));
			expect(blue.ownership.findOwnedRuntime({ partition: 2 })).toBeUndefined();
			expect(blue.errors).toEqual([]);
			expect(green.errors).toEqual([]);
		} finally {
			slotFlip.resolve();
			await blue.ownership.stop();
			await green.ownership.stop();
		}
	});

	test("a partition handed to another fleet is prepared again and returns on a reverse flip", async () => {
		// Each fleet's gate is a deferred the test swaps: resolved means the record names that fleet.
		const log = createOwnershipLog();
		const open = () => {
			const gate = deferred();
			gate.resolve();
			return gate;
		};
		const gates = { blue: open(), green: deferred() };
		// Like the real hook: resolves when the gate opens, rejects with the signal's reason on a revoke.
		const heldAt =
			(fleet: keyof typeof gates) =>
			({ signal }: { signal: AbortSignal }) =>
				new Promise<void>((resolve, reject) => {
					if (signal.aborted) return reject(signal.reason);
					signal.addEventListener("abort", () => reject(signal.reason), {
						once: true,
					});
					void gates[fleet].promise.then(resolve);
				});
		const blue = createWorker({
			name: "A",
			log,
			awaitReadyAnnouncement: heldAt("blue"),
		});
		const green = createWorker({
			name: "B",
			log,
			awaitReadyAnnouncement: heldAt("green"),
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(blue, [2]);
			await green.ownership.start();
			green.assign([2]);
			await waitFor(() => green.status(2) === "prepared");

			// Flip to green: blue hands off, then prepares the partition again and holds at its (now closed) gate.
			gates.blue = deferred();
			gates.green.resolve();
			await waitFor(() => green.status(2) === "ready");
			await waitFor(() => blue.has("stop:2"));
			await waitFor(
				() => blue.events.filter((e) => e === "A:prepare:2").length === 2,
			);
			await waitFor(() => blue.status(2) === "prepared");
			await settle();
			expect(blue.events.filter((e) => e === "A:announce:2")).toHaveLength(1);
			expect(blue.ownership.findOwnedRuntime({ partition: 2 })).toBeUndefined();
			// Its own roster dealing it the partition again changes nothing: it stays prepared and silent.
			blue.revoke();
			blue.assign([2]);
			await waitFor(() => blue.status(2) === "prepared");
			await settle();
			expect(blue.events.filter((e) => e === "A:announce:2")).toHaveLength(1);
			expect(green.status(2)).toBe("ready");

			// Flip back to blue: blue announces, green hands off and names blue, blue serves again.
			gates.green = deferred();
			gates.blue.resolve();
			await waitFor(() => blue.status(2) === "ready");
			expect(green.index("drained:2")).toBeLessThan(green.index("claim:A:2"));
			expect(green.has("release:2")).toBe(false);
			// Named by green, never claimed for itself a second time.
			expect(blue.events.filter((e) => e === "A:claim:A:2")).toHaveLength(1);
			expect(green.has("claim:A:2")).toBe(true);
			expect(blue.ownership.findOwnedRuntime({ partition: 2 })).toBeDefined();
			// Green in turn is prepared again for the next flip.
			await waitFor(() => green.status(2) === "prepared");
			// The revoke above interrupted a held startup, which is reported the way any revoke mid-startup is.
			expect(blue.errors.map(String)).toEqual([
				"PartitionRetiredError: Partition retired",
			]);
			expect(green.errors).toEqual([]);
		} finally {
			gates.blue.resolve();
			gates.green.resolve();
			await blue.ownership.stop();
			await green.ownership.stop();
		}
	});

	test("without a gate a partition handed to another fleet is not prepared again", async () => {
		const log = createOwnershipLog();
		const slotFlip = deferred();
		const blue = createWorker({ name: "A", log });
		const green = createWorker({
			name: "B",
			log,
			awaitReadyAnnouncement: () => slotFlip.promise,
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(blue, [2]);
			await green.ownership.start();
			green.assign([2]);
			await waitFor(() => green.status(2) === "prepared");
			slotFlip.resolve();
			await waitFor(() => green.status(2) === "ready");
			await waitFor(() => blue.has("stop:2"));
			await settle();
			expect(blue.events.filter((e) => e === "A:prepare:2")).toHaveLength(1);
			expect(blue.status(2)).toBe("stopped");
			expect(green.status(2)).toBe("ready");
		} finally {
			slotFlip.resolve();
			await blue.ownership.stop();
			await green.ownership.stop();
		}
	});

	test("a partition handed back to its owner still hands off to a later foreign ready", async () => {
		const log = createOwnershipLog();
		const A = createWorker({ name: "A", log });
		const B = createWorker({
			name: "B",
			log,
			config: { handoffClaimTimeoutMs: 5_000 },
		});
		try {
			await ownAlone(A, [2]);
			A.revoke();
			A.assign([2]);
			await settle();
			expect(A.has("withdraw:2")).toBe(false);

			await B.ownership.start();
			B.assign([2]);
			await waitFor(() => B.status(2) === "ready");
			expect(A.index("drained:2")).toBeLessThan(A.index("claim:B:2"));
			expect(A.has("release:2")).toBe(false);
			expect(A.errors).toEqual([]);
			expect(B.errors).toEqual([]);
		} finally {
			await A.ownership.stop();
			await B.ownership.stop();
		}
	});

	test("a standby whose preparation fails is retried alone while its other partitions keep preparing", async () => {
		const log = createOwnershipLog();
		const prepare = deferred();
		const failure = new OwnedPartitionRecoveryRequiredError({
			topic: "metering",
			partition: 2,
			cause: new PartitionPreparationFailedError({
				topic: "metering",
				partition: 2,
				cause: new StateAheadOfKafkaLogEndError({
					topic: "metering",
					partition: 2,
					storedNextOffset: 7n,
					logEndOffset: 5n,
				}),
			}),
		});
		const B = createWorker({
			name: "B",
			log,
			config: { partitionBootstrapRetryIntervalMs: 10 },
			prepareGate: prepare.promise,
			prepareFailures: new Map([[2, failure]]),
		});
		try {
			await B.ownership.start();
			B.assign([1, 2]);
			await waitFor(
				() => B.events.filter((e) => e === "B:prepare:2").length === 2,
			);
			expect(B.status(1)).toBe("created");
			expect(B.has("consumer-stop")).toBe(false);
		} finally {
			prepare.resolve();
			await B.ownership.stop();
		}
	});

	test("a partition revoked while still preparing is retired, not handed off", async () => {
		const log = createOwnershipLog();
		const prepare = deferred();
		const A = createWorker({ name: "A", log, prepareGate: prepare.promise });
		try {
			await A.ownership.start();
			A.assign([2]);
			await waitFor(() => A.has("prepare:2"));
			A.revoke();
			prepare.resolve();
			await waitFor(() => A.has("stop:2"));
			expect(A.has("announce:2")).toBe(false);
			expect(A.events.some((e) => e.startsWith("A:claim:"))).toBe(false);
		} finally {
			prepare.resolve();
			await A.ownership.stop();
		}
	});
});
