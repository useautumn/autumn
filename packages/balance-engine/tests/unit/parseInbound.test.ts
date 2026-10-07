import { describe, expect, test } from "bun:test";
import { parseEvictCommand, parseInbound } from "../../src/balanceEngine.js";

const evict = {
	schemaVersion: 1,
	type: "evict",
	requestId: "req_evict",
	identity: {
		orgId: "org_1",
		env: "live",
		customerId: "cus_1",
		entityId: null,
	},
	occurredAt: 1_700_000_000_000,
};

const fromNewerServer = {
	...evict,
	refreshEverything: true,
	identity: { ...evict.identity, region: "eu" },
};

describe("parseInbound", () => {
	test("drops and reports keys a newer producer added, without touching the caller's input", () => {
		const reported: string[][] = [];
		const input = structuredClone(fromNewerServer);

		const parsed = parseInbound({
			parse: parseEvictCommand,
			input,
			onUnknownKeys: ({ keyPaths }) => reported.push(keyPaths),
		});

		expect(parsed).toEqual(parseEvictCommand({ input: evict }));
		expect(reported).toEqual([["identity.region", "refreshEverything"]]);
		expect(input).toEqual(fromNewerServer);
	});

	test("reports nothing for a command it fully knows", () => {
		const reported: string[][] = [];

		parseInbound({
			parse: parseEvictCommand,
			input: evict,
			onUnknownKeys: ({ keyPaths }) => reported.push(keyPaths),
		});

		expect(reported).toEqual([]);
	});

	test("an unknown key never excuses a missing or mistyped one", () => {
		const { requestId: _, ...missing } = fromNewerServer;
		const mistyped = { ...fromNewerServer, occurredAt: "yesterday" };

		for (const input of [missing, mistyped]) {
			expect(() => parseInbound({ parse: parseEvictCommand, input })).toThrow();
		}
	});

	test("an unknown key outside `within` is still rejected", () => {
		expect(() =>
			parseInbound({
				parse: parseEvictCommand,
				input: fromNewerServer,
				within: ["identity"],
			}),
		).toThrow();
	});
});
