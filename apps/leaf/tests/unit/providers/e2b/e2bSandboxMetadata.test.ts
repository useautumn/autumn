import { describe, expect, test } from "bun:test";
import {
	e2bSandboxLookupMetadata,
	e2bSandboxMetadata,
	e2bThreadKey,
} from "../../../../src/providers/e2b/e2bSandboxMetadata.js";

const context = {
	channelId: "C123",
	env: "live",
	orgId: "org_123",
	provider: "slack",
	threadId: "1710000000.000",
	workspaceId: "T123",
};

describe("E2B sandbox metadata", () => {
	test("builds stable thread keys", () => {
		expect(e2bThreadKey({ context })).toBe(
			"org_123:live:slack:T123:C123:1710000000.000",
		);
	});

	test("builds full metadata and lookup metadata", () => {
		expect(e2bSandboxMetadata({ context })).toEqual({
			app: "leaf",
			channelId: "C123",
			env: "live",
			orgId: "org_123",
			provider: "slack",
			threadId: "1710000000.000",
			threadKey: "org_123:live:slack:T123:C123:1710000000.000",
			workspaceId: "T123",
		});
		expect(e2bSandboxLookupMetadata({ context })).toEqual({
			app: "leaf",
			threadKey: "org_123:live:slack:T123:C123:1710000000.000",
		});
	});
});
