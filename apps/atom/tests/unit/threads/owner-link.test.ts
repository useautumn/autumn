import { expect, test } from "bun:test";
import type { CheckRequest } from "../../../src/processor/types/check.js";
import type { Slots } from "../../../src/slots/types/slots.js";
import { answerOwnerCalls } from "../../../src/threads/owners/answerOwnerCalls.js";
import { createOwnerLink } from "../../../src/threads/owners/createOwnerLink.js";
import { OwnerUnavailableError } from "../../../src/threads/owners/ownerUnavailableError.js";

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
			check: async () => ({ json: '{"allowed":true}', allowed: true }),
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
	});
	expect(await listSince()).toEqual([]);

	link.disconnect();
	port2.close();
});
