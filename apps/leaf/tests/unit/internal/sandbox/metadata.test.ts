import { describe, expect, test } from "bun:test";
import {
	threadSandboxKey,
	threadSandboxLookupMetadata,
	threadSandboxMetadata,
} from "../../../../src/internal/sandbox/e2b/metadata.js";

const context = {
	channelId: "C123",
	env: "live",
	orgId: "org_123",
	provider: "slack",
	threadId: "1710000000.000",
	workspaceId: "T123",
};

describe("E2B sandbox metadata", () => {
	test("builds stable thread keys and tool metadata", () => {
		expect(threadSandboxKey({ context })).toBe(
			"org_123:live:slack:T123:C123:1710000000.000",
		);
		expect(threadSandboxMetadata({ context })).toMatchObject({
			app: "leaf",
			kind: "tool",
			orgId: "org_123",
			threadKey: "org_123:live:slack:T123:C123:1710000000.000",
		});
		expect(threadSandboxLookupMetadata({ context })).toEqual({
			app: "leaf",
			kind: "tool",
			threadKey: "org_123:live:slack:T123:C123:1710000000.000",
		});
	});
});
