import { describe, expect, test } from "bun:test";
import {
	appPortsFor,
	checkoutPortFor,
	dragonflyPortFor,
	dynamoDbPortFor,
	EMULATE_PORT,
	elasticMqPortFor,
	kafkaPortFor,
	leafPortFor,
	ngrokApiPortFor,
	serverPortFor,
	vitePortFor,
} from "./ports.ts";

describe("compose ports", () => {
	test("Kafka ports are unique and never recycled with app processes", () => {
		const ports = new Set<number>();
		for (let worktree = 1; worktree <= 50; worktree++) {
			const port = kafkaPortFor(worktree);
			expect(port).not.toBe(19092);
			expect(ports.has(port)).toBe(false);
			expect(appPortsFor(worktree)).not.toContain(port);
			ports.add(port);
		}
		expect(kafkaPortFor(1)).toBe(24092);
		expect(kafkaPortFor(2)).toBe(19192);
	});

	test("worktree 1 does not publish onto bun d 6379/8000", () => {
		expect(dragonflyPortFor(1)).not.toBe(6379);
		expect(dragonflyPortFor(1)).not.toBe(6380);
		expect(dynamoDbPortFor(1)).not.toBe(8000);
		expect(dragonflyPortFor(2)).toBe(6479);
		expect(elasticMqPortFor(2)).toBe(9424);
		expect(dynamoDbPortFor(2)).toBe(8100);
	});
});

describe("appPortsFor", () => {
	test("recycles app servers only — not cloudflared or emulate", () => {
		const n = 45;
		expect(appPortsFor(n)).toEqual([
			serverPortFor(n),
			vitePortFor(n),
			checkoutPortFor(n),
			leafPortFor(n),
		]);
		expect(appPortsFor(n)).not.toContain(ngrokApiPortFor(n));
		expect(appPortsFor(n)).not.toContain(EMULATE_PORT);
	});
});
