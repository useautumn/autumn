import { describe, expect, test } from "bun:test";
import { getSlackWorkspaceId } from "../../../../src/providers/slack/context.js";

describe("chat context", () => {
	test("parses Slack workspace ids", () => {
		expect(getSlackWorkspaceId({ team_id: "T123" })).toBe("T123");
		expect(getSlackWorkspaceId({ team: { id: "T456" } })).toBe("T456");
	});

	test("rejects missing workspace ids", () => {
		expect(() => getSlackWorkspaceId({})).toThrow();
	});
});
