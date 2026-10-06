import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { QueueMessage } from "@alienplatform/bindings";
import { AtomPushType, atomPushMessageToPayload } from "@autumn/byoc";
import { createDeployedAuth } from "../../../src/auth/createDeployedAuth.js";
import type { Auth } from "../../../src/auth/types/auth.js";
import { createMultiTenantAuth } from "../../../src/multiTenant/createMultiTenantAuth.js";
import { createPushReceiver } from "../../../src/pushes/createPushReceiver.js";
import {
	checkRequestFor,
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
	payload,
}: {
	atomId?: string | null;
	payload?: string;
}): QueueMessage => ({
	payloadType: "text",
	payload:
		payload ??
		atomPushMessageToPayload({
			message: {
				type: AtomPushType.SetSubject,
				atomId,
				readAt: Date.now(),
				body: subjectBody({ balance: 10 }),
			},
		}),
	receiptHandle: `receipt_${crypto.randomUUID()}`,
	attempt: 1,
});

/** Hands each batch out once, then stops the receiver on its next empty receive. */
const fakeQueue = ({ batches }: { batches: QueueMessage[][] }) => {
	const acked: string[] = [];
	let stop = () => {};
	return {
		acked,
		onDrained: (callback: () => void) => {
			stop = callback;
		},
		queue: {
			receive: async () => {
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
	batches: QueueMessage[][];
}) => {
	const fake = fakeQueue({ batches });
	const warnings: string[] = [];
	const receiver = createPushReceiver({
		ctx: {
			pushes: fake.queue,
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

const checkCustomer = (slots: ReturnType<Auth["authorize"]>) =>
	slots
		?.processorFor({ customerId: "cus_1" })
		.check({ request: checkRequestFor({ params: { required_balance: 5 } }) });

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
		expect(checkCustomer(auth.slots)).toMatchObject({ allowed: true });
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
			checkCustomer(auth.pushSlots({ atomId: "org_a.sandbox" })),
		).toMatchObject({ allowed: true });
		expect(
			forwardReasonOf(() =>
				checkCustomer(auth.pushSlots({ atomId: "org_b.sandbox" })),
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
				pushes: {
					receive: async () => {
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
		expect(checkCustomer(auth.slots)).toMatchObject({ allowed: true });
	});
});
