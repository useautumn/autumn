import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AtomPushType, atomPushMessageToPayload } from "@autumn/byoc";
import { createDeployedAuth } from "../../../src/auth/createDeployedAuth.js";
import type { Auth } from "../../../src/auth/types/auth.js";
import { createMultiTenantAuth } from "../../../src/multiTenant/createMultiTenantAuth.js";
import { createPushReceiver } from "../../../src/pushes/createPushReceiver.js";
import type { PulledPush } from "../../../src/pushQueue/types/pushQueue.js";
import {
	checkRequestFor,
	checkResponseOf,
	forwardReasonOf,
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
	customerId?: string;
	payload?: string;
}): PulledPush => ({
	payload:
		payload ??
		atomPushMessageToPayload({
			message: {
				type: AtomPushType.SetSubject,
				atomId,
				customerId,
				readAt: Date.now(),
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
			dataDir: newDataDir(),
			tokenHash: TOKEN_HASH,
			slotCount: 2,
		});
		opened.push(auth);
		const message = subjectMessage({});

		const { acked } = await drain({ auth, batches: [[message]] });

		expect(acked).toEqual([message.receiptHandle]);
		expect(await checkCustomer(auth.slots)).toMatchObject({ allowed: true });
	});

	test("a queued push routed to another customer than it holds is dropped, never redelivered", async () => {
		const auth = createDeployedAuth({
			dataDir: newDataDir(),
			tokenHash: TOKEN_HASH,
			slotCount: 2,
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

	test("a multi-tenant Atom applies a push to the folder it names", async () => {
		const auth = createMultiTenantAuth({ dataDir: newDataDir(), slotCount: 2 });
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
		const auth = createMultiTenantAuth({ dataDir: newDataDir(), slotCount: 2 });
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
			dataDir: newDataDir(),
			tokenHash: TOKEN_HASH,
			slotCount: 2,
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

describe("push receiver with a hung SQS call", () => {
	const never = <T>() => new Promise<T>(() => {});
	const openDeployed = () => {
		const auth = createDeployedAuth({
			dataDir: newDataDir(),
			tokenHash: TOKEN_HASH,
			slotCount: 2,
		});
		opened.push(auth);
		return auth;
	};
	const until = async (condition: () => boolean) => {
		for (let i = 0; i < 200 && !condition(); i++) await Bun.sleep(5);
	};

	test("acks and a receive that never return hold up nothing else: every other push is applied and acked", async () => {
		// One hung ack per receive loop: a loop that waited on its batch's acks would stop receiving for good.
		const batches = Array.from({ length: 4 }, () => [
			subjectMessage({}),
			subjectMessage({}),
		]);
		const later = [subjectMessage({}), subjectMessage({})];
		const hung = new Set(batches.map(([message]) => message?.receiptHandle));
		const acked: string[] = [];
		const warnings: string[] = [];
		let receives = 0;
		const receiver = createPushReceiver({
			ctx: {
				pushQueue: {
					pull: async () => {
						receives += 1;
						const call = receives;
						if (call <= batches.length) return batches[call - 1] ?? [];
						if (call === batches.length + 1) return never();
						// A real receive waits on the network; an instant empty one would never yield to timers.
						await Bun.sleep(1);
						return call === batches.length + 2 ? later : [];
					},
					ack: async (receipt: string) => {
						if (hung.has(receipt)) return never();
						acked.push(receipt);
					},
				},
				auth: openDeployed(),
				logger: {
					warn: (fields) =>
						warnings.push(String((fields as { type: string }).type)),
				},
				sleep: async () => {},
			},
			limits: { maxPushesInFlight: 400, receiveDeadlineMs: 20 },
		});

		void receiver.run();
		await until(() => acked.length === 6 && warnings.length > 0);
		receiver.stop();

		const expected = [...batches.map(([, message]) => message), ...later];
		expect(acked.sort()).toEqual(
			expected.map((message) => message?.receiptHandle ?? "").sort(),
		);
		expect(warnings).toContain("atom_push_receive_slow");
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
				logger: { warn: () => {} },
				sleep: async () => {},
			},
			limits: { maxPushesInFlight: 3, receiveDeadlineMs: 1000 },
		});

		void receiver.run();
		await Bun.sleep(100);
		receiver.stop();

		// Each of the 4 loops may hold one batch past the cap before it waits.
		expect(receives).toBeGreaterThanOrEqual(3);
		expect(receives).toBeLessThanOrEqual(3 + 4);
	});
});
