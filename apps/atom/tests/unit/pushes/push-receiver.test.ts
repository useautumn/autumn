import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AtomPushType, atomPushMessageToPayload } from "@autumn/byoc";
import { createDeployedAuth } from "../../../src/auth/createDeployedAuth.js";
import type { Auth } from "../../../src/auth/types/auth.js";
import { createMultiTenantAuth } from "../../../src/multiTenant/createMultiTenantAuth.js";
import {
	createPushReceiver,
	MAX_PUSH_ATTEMPTS,
} from "../../../src/pushes/createPushReceiver.js";
import type { PulledPush } from "../../../src/pushQueue/types/pushQueue.js";
import {
	allSlotsOwnedHere,
	checkRequestFor,
	checkResponseOf,
	forwardingNowhere,
	forwardReasonOf,
	freshHeld,
	noReplication,
	noSubjectPulls,
	subjectBody,
} from "../utils/atomFixtures.js";

const TOKEN_HASH = "a".repeat(64);
const opened: Auth[] = [];
const directories: string[] = [];
afterEach(() => {
	for (const auth of opened.splice(0)) auth.close();
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

const newDataDir = () => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-pushes-"));
	directories.push(dataDir);
	return dataDir;
};

const subjectMessage = ({
	atomId = null,
	customerId = "cus_1",
	payload,
}: {
	atomId?: string | null;
	customerId?: string | null;
	payload?: string;
}): PulledPush => ({
	payload:
		payload ??
		atomPushMessageToPayload({
			message: {
				type: AtomPushType.SetSubject,
				atomId,
				customerId,
				body: subjectBody({ balance: 10 }),
			},
		}),
	receiptHandle: `receipt_${crypto.randomUUID()}`,
	attempt: 1,
});

/** Hands each batch out once, then stops the receiver on its next empty receive. */
const fakeQueue = ({ batches }: { batches: PulledPush[][] }) => {
	const acked: string[] = [];
	let stop = () => {};
	return {
		acked,
		onDrained: (callback: () => void) => {
			stop = callback;
		},
		queue: {
			pull: async () => {
				const batch = batches.shift();
				if (!batch) stop();
				return batch ?? [];
			},
			ack: async (receipt: string) => {
				acked.push(receipt);
			},
		},
	};
};

const drain = async ({
	auth,
	batches,
}: {
	auth: Auth;
	batches: PulledPush[][];
}) => {
	const fake = fakeQueue({ batches });
	const warnings: string[] = [];
	const receiver = createPushReceiver({
		ctx: {
			pushQueue: fake.queue,
			auth,
			replication: noReplication,
			logger: {
				warn: (fields) =>
					warnings.push(String((fields as { type: string }).type)),
			},
			sleep: async () => {},
		},
	});
	fake.onDrained(receiver.stop);
	await receiver.run();
	return { acked: fake.acked, warnings };
};

const checkCustomer = async (slots: ReturnType<Auth["authorize"]>) => {
	const processor = slots?.processorFor({ customerId: "cus_1" });
	if (!processor) return undefined;
	return checkResponseOf({
		processor,
		request: checkRequestFor({ params: { required_balance: 5 } }),
	});
};

describe("push receiver", () => {
	test("an org's Atom applies a queued subject through the HTTP route's apply, then acks it", async () => {
		const auth = createDeployedAuth({
			journalForwarder: forwardingNowhere,
			dataDir: newDataDir(),
			tokenHash: TOKEN_HASH,
			slotCount: 2,
			owners: allSlotsOwnedHere,
			held: freshHeld(),
			subjectPulls: noSubjectPulls,
		});
		opened.push(auth);
		const message = subjectMessage({});

		const { acked } = await drain({ auth, batches: [[message]] });

		expect(acked).toEqual([message.receiptHandle]);
		expect(await checkCustomer(auth.slots)).toMatchObject({ allowed: true });
	});

	test("a queued push routed to another customer than it holds is dropped, never redelivered", async () => {
		const auth = createDeployedAuth({
			journalForwarder: forwardingNowhere,
			dataDir: newDataDir(),
			tokenHash: TOKEN_HASH,
			slotCount: 2,
			owners: allSlotsOwnedHere,
			held: freshHeld(),
			subjectPulls: noSubjectPulls,
		});
		opened.push(auth);
		const message = subjectMessage({ customerId: "cus_2" });

		const { acked, warnings } = await drain({ auth, batches: [[message]] });

		expect(acked).toEqual([message.receiptHandle]);
		expect(warnings).toEqual(["atom_push_invalid"]);
		expect(await forwardReasonOf(() => checkCustomer(auth.slots))).toBe(
			"customer_not_stored",
		);
	});

	test("a queued subject push without its customer id is dropped, never redelivered", async () => {
		const auth = createDeployedAuth({
			journalForwarder: forwardingNowhere,
			dataDir: newDataDir(),
			tokenHash: TOKEN_HASH,
			slotCount: 2,
			owners: allSlotsOwnedHere,
			held: freshHeld(),
			subjectPulls: noSubjectPulls,
		});
		opened.push(auth);
		const message = subjectMessage({ customerId: null });

		const { acked, warnings } = await drain({ auth, batches: [[message]] });

		expect(acked).toEqual([message.receiptHandle]);
		expect(warnings).toEqual(["atom_push_invalid"]);
		expect(await forwardReasonOf(() => checkCustomer(auth.slots))).toBe(
			"customer_not_stored",
		);
	});

	test("a multi-tenant Atom applies a push to the folder it names", async () => {
		const auth = createMultiTenantAuth({
			journalForwarder: forwardingNowhere,
			dataDir: newDataDir(),
			slotCount: 2,
			owners: allSlotsOwnedHere,
			heldSubjects: freshHeld(),
			subjectPulls: noSubjectPulls,
		});
		opened.push(auth);
		auth.putAtom({ id: "org_a.sandbox", tokenHash: TOKEN_HASH });
		auth.putAtom({ id: "org_b.sandbox", tokenHash: "b".repeat(64) });

		await drain({
			auth,
			batches: [[subjectMessage({ atomId: "org_a.sandbox" })]],
		});

		expect(
			await checkCustomer(auth.slotsFor({ atomId: "org_a.sandbox" })),
		).toMatchObject({ allowed: true });
		expect(
			await forwardReasonOf(() =>
				checkCustomer(auth.slotsFor({ atomId: "org_b.sandbox" })),
			),
		).toBe("customer_not_stored");
	});

	test("a push that can never apply is acked and logged, not redelivered forever", async () => {
		const auth = createMultiTenantAuth({
			journalForwarder: forwardingNowhere,
			dataDir: newDataDir(),
			slotCount: 2,
			owners: allSlotsOwnedHere,
			heldSubjects: freshHeld(),
			subjectPulls: noSubjectPulls,
		});
		opened.push(auth);
		const unreadable = subjectMessage({ payload: "not json" });
		const unrouted = subjectMessage({ atomId: "org_gone.sandbox" });

		const { acked, warnings } = await drain({
			auth,
			batches: [[unreadable, unrouted]],
		});

		expect(acked.sort()).toEqual(
			[unreadable.receiptHandle, unrouted.receiptHandle].sort(),
		);
		expect(warnings.sort()).toEqual([
			"atom_push_invalid",
			"atom_push_unrouted",
		]);
	});

	test("a failed receive is logged and retried, never ending the receiver", async () => {
		const auth = createDeployedAuth({
			journalForwarder: forwardingNowhere,
			dataDir: newDataDir(),
			tokenHash: TOKEN_HASH,
			slotCount: 2,
			owners: allSlotsOwnedHere,
			held: freshHeld(),
			subjectPulls: noSubjectPulls,
		});
		opened.push(auth);
		const message = subjectMessage({});
		let calls = 0;
		const warnings: string[] = [];
		const receiver = createPushReceiver({
			ctx: {
				pushQueue: {
					pull: async () => {
						calls += 1;
						if (calls === 1) throw new Error("queue unreachable");
						if (calls === 2) return [message];
						receiver.stop();
						return [];
					},
					ack: async () => {},
				},
				auth,
				replication: noReplication,
				logger: {
					warn: (fields) =>
						warnings.push(String((fields as { type: string }).type)),
				},
				sleep: async () => {},
			},
		});

		await receiver.run();

		expect(warnings).toContain("atom_push_receive_failed");
		expect(await checkCustomer(auth.slots)).toMatchObject({ allowed: true });
	});
});

describe("push receiver under a hung or stopped queue", () => {
	const never = <T>() => new Promise<T>(() => {});
	const openDeployed = () => {
		const auth = createDeployedAuth({
			journalForwarder: forwardingNowhere,
			dataDir: newDataDir(),
			tokenHash: TOKEN_HASH,
			slotCount: 2,
			owners: allSlotsOwnedHere,
			held: freshHeld(),
			subjectPulls: noSubjectPulls,
		});
		opened.push(auth);
		return auth;
	};
	const until = async (condition: () => boolean) => {
		for (let i = 0; i < 200 && !condition(); i++) await Bun.sleep(5);
	};

	test("a hung ack holds up nothing else: every other push is applied and acked", async () => {
		// One hung ack per receive loop: a loop that waited on its batch's acks would stop receiving for good.
		const batches = Array.from({ length: 4 }, () => [
			subjectMessage({}),
			subjectMessage({}),
		]);
		const later = [subjectMessage({}), subjectMessage({})];
		const hung = new Set(batches.map(([message]) => message?.receiptHandle));
		const acked: string[] = [];
		let receives = 0;
		const receiver = createPushReceiver({
			ctx: {
				pushQueue: {
					pull: async () => {
						receives += 1;
						const call = receives;
						if (call <= batches.length) return batches[call - 1] ?? [];
						// A real receive waits on the network; an instant empty one would never yield to timers.
						await Bun.sleep(1);
						return call === batches.length + 1 ? later : [];
					},
					ack: async (receipt: string) => {
						if (hung.has(receipt)) return never();
						acked.push(receipt);
					},
				},
				auth: openDeployed(),
				replication: noReplication,
				logger: { warn: () => {} },
				sleep: async () => {},
			},
		});

		void receiver.run();
		await until(() => acked.length === 6);
		receiver.stop();

		const expected = [...batches.map(([, message]) => message), ...later];
		expect(acked.sort()).toEqual(
			expected.map((message) => message?.receiptHandle ?? "").sort(),
		);
	});

	test("stop ends a receive still long-polling, and the pushes already received are settled first", async () => {
		const message = subjectMessage({});
		const acked: string[] = [];
		const warnings: string[] = [];
		let receives = 0;
		const receiver = createPushReceiver({
			ctx: {
				pushQueue: {
					pull: async ({ signal }) => {
						receives += 1;
						if (receives === 1) return [message];
						return new Promise((_, reject) =>
							signal.addEventListener("abort", () =>
								reject(new DOMException("aborted", "AbortError")),
							),
						);
					},
					ack: async (receipt: string) => {
						await Bun.sleep(20);
						acked.push(receipt);
					},
				},
				auth: openDeployed(),
				replication: noReplication,
				logger: {
					warn: (fields) =>
						warnings.push(String((fields as { type: string }).type)),
				},
			},
		});

		const running = receiver.run();
		await Bun.sleep(5);
		receiver.stop();
		await running;

		expect(acked).toEqual([message.receiptHandle]);
		expect(warnings).toEqual([]);
	});

	test("receiving waits once the pushes in flight reach the cap", async () => {
		let receives = 0;
		const receiver = createPushReceiver({
			ctx: {
				pushQueue: {
					pull: async () => {
						receives += 1;
						await Bun.sleep(1);
						return [subjectMessage({})];
					},
					ack: () => never(),
				},
				auth: openDeployed(),
				replication: noReplication,
				logger: { warn: () => {} },
				sleep: async () => {},
			},
			maxPushesInFlight: 3,
		});

		void receiver.run();
		await Bun.sleep(100);
		receiver.stop();

		// Each of the 4 loops may hold one batch past the cap before it waits.
		expect(receives).toBeGreaterThanOrEqual(3);
		expect(receives).toBeLessThanOrEqual(3 + 4);
	});

	test("a push whose body cannot be decoded is acked and logged as invalid, never redelivered", async () => {
		const corrupt = subjectMessage({
			payload: JSON.stringify({
				type: AtomPushType.SetSubject,
				atom: null,
				customer: "cus_1",
				enc: "gzip",
				body: Buffer.from("not gzip").toString("base64"),
			}),
		});

		const { acked, warnings } = await drain({
			auth: openDeployed(),
			batches: [[corrupt]],
		});

		expect(acked).toEqual([corrupt.receiptHandle]);
		expect(warnings).toEqual(["atom_push_invalid"]);
	});

	test("a push still failing after its last try is acked and dropped without being applied again", async () => {
		const applied: number[] = [];
		const failing = {
			slotsFor: () =>
				({
					processorFor: () => ({
						setSubject: async () => {
							applied.push(1);
							throw new Error("disk I/O error");
						},
					}),
				}) as unknown as ReturnType<Auth["slotsFor"]>,
		};
		const lastTry = { ...subjectMessage({}), attempt: MAX_PUSH_ATTEMPTS };
		const pastIt = { ...subjectMessage({}), attempt: MAX_PUSH_ATTEMPTS + 1 };

		const { acked, warnings } = await drain({
			auth: failing as unknown as Auth,
			batches: [[lastTry], [pastIt]],
		});

		expect(applied).toHaveLength(1);
		expect(acked).toEqual([pastIt.receiptHandle]);
		expect(warnings.sort()).toEqual(["atom_push_dropped", "atom_push_failed"]);
	});
});
