import { expect, test } from "bun:test";
import { LockAlreadyExistsError } from "@autumn/balance-engine";
import { atomErrorOf } from "../../../src/http/handlers/errorHandler/atomErrorOf.js";
import { CustomerMovedError } from "../../../src/processor/ownership/customerMovedError.js";
import type { CheckRequest } from "../../../src/processor/types/check.js";
import type { TrackRequest } from "../../../src/processor/types/track.js";
import type { Slots } from "../../../src/slots/types/slots.js";
import { answerOwnerCalls } from "../../../src/threads/owners/answerOwnerCalls.js";
import { createOwnerLink } from "../../../src/threads/owners/createOwnerLink.js";
import { OwnerUnavailableError } from "../../../src/threads/owners/ownerUnavailableError.js";
import { checkRequestFor, trackRequestFor } from "../utils/atomFixtures.js";

test("a full link sheds pushes but still delivers a catalog install", async () => {
	const { port1, port2 } = new MessageChannel();
	const received: string[] = [];
	port2.onmessage = (event: MessageEvent) => {
		const message =
			typeof event.data === "string" ? JSON.parse(event.data) : event.data;
		received.push(message.type);
	};
	const link = createOwnerLink({ thread: 1 });
	link.connect({ port: port1 });
	const processor = link.processorFor({ atomId: null });

	const unanswered = Array.from({ length: 512 }, (_, index) =>
		processor
			.setSubject({ customerId: `cus_${index}`, body: "{}" })
			.catch(() => null),
	);
	await expect(
		processor.setSubject({ customerId: "cus_shed", body: "{}" }),
	).rejects.toBeInstanceOf(OwnerUnavailableError);
	const install = link
		.catalogFor({ atomId: null })
		.installCatalog({ rows: [], readAt: 1 })
		.catch(() => null);

	for (let i = 0; i < 50 && !received.includes("installCatalog"); i++)
		await Bun.sleep(5);
	expect(received.filter((type) => type === "setSubject")).toHaveLength(512);
	expect(received).toContain("installCatalog");

	link.disconnect();
	port2.close();
	await Promise.all([...unanswered, install]);
});

test("an owner still catching up refuses checks and reads with a 503, so the API answers, but still takes pushes", async () => {
	const { port1, port2 } = new MessageChannel();
	const threadsReady = new Int32Array(2);
	const applied: string[] = [];
	const slots = {
		processorFor: () => ({
			check: async () => ({
				json: '{"allowed":true}',
				allowed: true,
				denial: null,
			}),
			setSubject: async ({ customerId }: { customerId: string }) => {
				applied.push(customerId);
				return { stored: true, entityId: null };
			},
		}),
		listSince: async () => [],
	} as unknown as Slots;
	answerOwnerCalls({
		ctx: {
			auth: { slotsFor: () => slots },
			health: { threadsReady, thread: 1 },
		},
		port: port2,
	});
	const link = createOwnerLink({ thread: 1 });
	link.connect({ port: port1 });
	const processor = link.processorFor({ atomId: null });
	const request = {
		requestId: "req_1",
		occurredAt: 1,
		params: { customer_id: "cus_1", feature_id: "messages" },
		query: {},
		apiVersion: null,
	} as unknown as CheckRequest;
	const listSince = () =>
		link.listSince({
			atomId: null,
			slot: 0,
			after: null,
			cursor: null,
			limit: 10,
		});

	await expect(processor.check({ request })).rejects.toBeInstanceOf(
		OwnerUnavailableError,
	);
	await expect(listSince()).rejects.toBeInstanceOf(OwnerUnavailableError);
	expect(
		await processor.setSubject({ customerId: "cus_1", body: "{}" }),
	).toEqual({ stored: true, entityId: null });
	expect(applied).toEqual(["cus_1"]);

	Atomics.store(threadsReady, 1, 1);
	expect(await processor.check({ request })).toEqual({
		json: '{"allowed":true}',
		allowed: true,
		denial: null,
	});
	expect(await listSince()).toEqual([]);

	link.disconnect();
	port2.close();
});

test("a track crosses to the owner with its API version, once the owner has caught up", async () => {
	const { port1, port2 } = new MessageChannel();
	const threadsReady = new Int32Array(2);
	const received: TrackRequest[] = [];
	const slots = {
		processorFor: () => ({
			track: async ({ request }: { request: TrackRequest }) => {
				received.push(request);
				return { customer_id: "cus_1", value: 1, balance: null };
			},
		}),
	} as unknown as Slots;
	answerOwnerCalls({
		ctx: {
			auth: { slotsFor: () => slots },
			health: { threadsReady, thread: 1 },
		},
		port: port2,
	});
	const link = createOwnerLink({ thread: 1 });
	link.connect({ port: port1 });
	const processor = link.processorFor({ atomId: null });
	const request = trackRequestFor({ idempotencyKey: "evt_1" });

	await expect(processor.track({ request })).rejects.toBeInstanceOf(
		OwnerUnavailableError,
	);
	Atomics.store(threadsReady, 1, 1);
	expect(await processor.track({ request })).toEqual({
		customer_id: "cus_1",
		value: 1,
		balance: null,
	});
	expect(received).toEqual([request]);
	expect(received[0]?.apiVersion.value).toBe(request.apiVersion.value);

	link.disconnect();
	port2.close();
});

test("a lock_id the owner refuses as open crosses back as the API's 409, never a 500", async () => {
	const { port1, port2 } = new MessageChannel();
	const slots = {
		processorFor: () => ({
			check: async () => {
				throw new LockAlreadyExistsError({ lockId: "lock_1" });
			},
		}),
	} as unknown as Slots;
	answerOwnerCalls({
		ctx: {
			auth: { slotsFor: () => slots },
			health: { threadsReady: new Int32Array([1, 1]), thread: 1 },
		},
		port: port2,
	});
	const link = createOwnerLink({ thread: 1 });
	link.connect({ port: port1 });

	const refused = await link
		.processorFor({ atomId: null })
		.check({ request: checkRequestFor() })
		.catch((error: Error) => error);

	expect(atomErrorOf({ cause: refused as Error })).toEqual({
		status: 409,
		code: "lock_already_exists",
		message: "A lock with this ID already exists",
	});

	link.disconnect();
	port2.close();
});

test("a customer the owner refuses as moved crosses back as the same refusal, naming the new owner, never a 500", async () => {
	const { port1, port2 } = new MessageChannel();
	const slots = {
		processorFor: () => ({
			check: async () => {
				throw new CustomerMovedError({ owner: "10.0.0.2" });
			},
		}),
	} as unknown as Slots;
	answerOwnerCalls({
		ctx: {
			auth: { slotsFor: () => slots },
			health: { threadsReady: new Int32Array([1, 1]), thread: 1 },
		},
		port: port2,
	});
	const link = createOwnerLink({ thread: 1 });
	link.connect({ port: port1 });

	const refused = await link
		.processorFor({ atomId: null })
		.check({ request: checkRequestFor() })
		.catch((error: Error) => error);

	expect(refused).toBeInstanceOf(CustomerMovedError);
	expect((refused as CustomerMovedError).owner).toBe("10.0.0.2");

	link.disconnect();
	port2.close();
});

test("relayed idempotency keys cross to the slot's owner even while it catches up; its recent keys are read only once it has", async () => {
	const { port1, port2 } = new MessageChannel();
	const threadsReady = new Int32Array(2);
	const key = { customerId: "cus_1", keyHash: "ab".repeat(16), appendedAt: 1 };
	const received: unknown[] = [];
	const slots = {
		processorFor: () => ({
			receiveRelayedKeys: async ({ keys }: { keys: unknown[] }) => {
				received.push(...keys);
				return { held: keys.length };
			},
		}),
		recentKeys: async () => [key],
	} as unknown as Slots;
	answerOwnerCalls({
		ctx: {
			auth: { slotsFor: () => slots },
			health: { threadsReady, thread: 1 },
		},
		port: port2,
	});
	const link = createOwnerLink({ thread: 1 });
	link.connect({ port: port1 });
	const recentKeys = () =>
		link.recentKeys({ atomId: null, slot: 0, after: null, limit: 10 });

	expect(
		await link
			.processorFor({ atomId: null })
			.receiveRelayedKeys({ keys: [key] }),
	).toEqual({ held: 1 });
	expect(received).toEqual([key]);
	expect(await recentKeys().catch((error) => error)).toBeInstanceOf(
		OwnerUnavailableError,
	);

	Atomics.store(threadsReady, 1, 1);
	expect(await recentKeys()).toEqual([key]);

	link.disconnect();
	port2.close();
});
