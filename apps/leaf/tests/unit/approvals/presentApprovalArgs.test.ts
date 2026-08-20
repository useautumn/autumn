import { describe, expect, test } from "bun:test";
import { withheldWritesFromToolArgs } from "../../../src/internal/agentRuntime/eve/parkedInput.js";
import { publicToolArgs } from "../../../src/internal/approvals/utils/toolRequest.js";

// The card needs the grouped writes, but `_eve*` keys are stripped as transport
// before it renders — so the grouped steps must survive that strip.
describe("grouped writes survive the public tool args strip", () => {
	const toolArgs = {
		_eveApproveOptionId: "approve",
		_eveWithheldWrites: [
			{
				input: { request: { plan_id: "launch" } },
				requestId: "req_2",
				toolName: "autumn__attach",
			},
		],
		request: { customer_id: "leaf-0001", email: "test@oioi.com" },
	};

	test("keeps the grouped writes readable by the card", () => {
		const forCard = publicToolArgs(toolArgs);
		expect(withheldWritesFromToolArgs(forCard)).toHaveLength(1);
	});

	test("still drops the transport option ids", () => {
		expect(publicToolArgs(toolArgs)._eveApproveOptionId).toBeUndefined();
	});
});
