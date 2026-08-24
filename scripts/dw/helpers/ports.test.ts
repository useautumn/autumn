import { describe, expect, test } from "bun:test";
import {
	appPortsFor,
	checkoutPortFor,
	dragonflyPortFor,
	dynamoDbPortFor,
	elasticMqPortFor,
	EMULATE_PORT,
	leafPortFor,
	ngrokApiPortFor,
	serverPortFor,
	vitePortFor,
} from "./ports.ts";

describe("compose ports", () => {
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
