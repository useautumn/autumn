import { describe, expect, test } from "bun:test";
import {
	appPortsFor,
	checkoutPortFor,
	EMULATE_PORT,
	leafPortFor,
	ngrokApiPortFor,
	serverPortFor,
	vitePortFor,
} from "./ports.ts";

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
