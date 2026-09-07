import { describe, expect, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import { parseTrackRequest, parseWorkerRequest } from "../src/protocol.js";

const command: TrackCommand = {
	schemaVersion: 1,
	type: "track",
	commandId: "command",
	requestId: "request",
	identity: { orgId: "org", env: "sandbox", customerId: "customer" },
	entityId: null,
	featureId: "feature",
	value: 1,
	overageBehavior: "reject",
	properties: null,
	occurredAt: 0,
};
describe("Track wire contract", () => {
	test("shared request parsing preserves commands without interpreting them", () => {
		const input = {
			route: { partition: 2, routeEpoch: "9007199254740993" },
			command: { type: "check", identity: command.identity },
		};
		expect(parseWorkerRequest({ input })).toEqual(input);
	});
	test("preserves a full engine command and arbitrarily large decimal epoch", () => {
		const request = {
			route: { partition: 2, routeEpoch: "9007199254740993" },
			command,
		};
		expect(parseTrackRequest({ input: request })).toEqual(request);
	});
	test.each(["01", "-1", "+1", "1.0", "1e3", "", " 1", 1])(
		"rejects noncanonical epoch %j",
		(routeEpoch) => {
			expect(() =>
				parseTrackRequest({
					input: { route: { partition: 0, routeEpoch }, command },
				}),
			).toThrow();
		},
	);
	test.each([undefined, 0, 2])(
		"delegates unsupported engine version %j to its parser",
		(schemaVersion) => {
			expect(() =>
				parseTrackRequest({
					input: {
						route: { partition: 0, routeEpoch: "0" },
						command: { ...command, schemaVersion },
					},
				}),
			).toThrow();
		},
	);
});
