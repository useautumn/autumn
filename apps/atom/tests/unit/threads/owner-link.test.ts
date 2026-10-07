import { expect, test } from "bun:test";
import { createOwnerLink } from "../../../src/threads/owners/createOwnerLink.js";
import { OwnerUnavailableError } from "../../../src/threads/owners/ownerUnavailableError.js";

test("a full link sheds pushes but still delivers a catalog install, and counts what waits on it", async () => {
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
	expect(link.waiting()).toBe(512);
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
	expect(link.waiting()).toBe(0);
});
