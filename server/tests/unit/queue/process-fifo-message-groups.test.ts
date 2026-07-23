import { describe, expect, test } from "bun:test";
import type { Message } from "@aws-sdk/client-sqs";
import { processFifoMessageGroups } from "@/queue/processFifoMessageGroups.js";

const message = ({ id, group }: { id: string; group: string }): Message => ({
	MessageId: id,
	Attributes: { MessageGroupId: group },
});

describe("processFifoMessageGroups", () => {
	test("processes each group sequentially and stops it after a failure", async () => {
		const calls: string[] = [];
		const messages = [
			message({ id: "a1", group: "a" }),
			message({ id: "a2", group: "a" }),
			message({ id: "b1", group: "b" }),
		];

		const processed = await processFifoMessageGroups({
			messages,
			processMessage: async (item) => {
				calls.push(item.MessageId!);
				if (item.MessageId === "a1") throw new Error("retry");
				return item.MessageId!;
			},
		});

		expect(calls).toContain("a1");
		expect(calls).toContain("b1");
		expect(calls).not.toContain("a2");
		expect(processed).toEqual(["b1"]);
	});

	test("preserves order within a successful group", async () => {
		const calls: string[] = [];

		await processFifoMessageGroups({
			messages: [
				message({ id: "a1", group: "a" }),
				message({ id: "a2", group: "a" }),
			],
			processMessage: async (item) => {
				calls.push(item.MessageId!);
				return item.MessageId!;
			},
		});

		expect(calls).toEqual(["a1", "a2"]);
	});
});
