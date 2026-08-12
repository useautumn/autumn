import { describe, expect, test } from "bun:test";
import { classifyParkedEveInput } from "../../../src/harness/eve/classifyParkedInput.js";

describe("classifyParkedEveInput", () => {
	test("surfaces an ask_question with no options instead of dropping it", () => {
		const parked = classifyParkedEveInput({
			requests: [
				{
					action: { toolName: "ask_question" },
					prompt: "Which plan should I migrate them onto?",
					requestId: "req_2",
				},
			],
			skipRequestId: "req_1",
		});

		expect(parked).toEqual({
			kind: "waiting",
			text: "Which plan should I migrate them onto?",
		});
	});

	test("falls back to a generic line when the park carries no prompt", () => {
		const parked = classifyParkedEveInput({
			requests: [{ requestId: "req_2" }],
		});

		expect(parked).toEqual({
			kind: "waiting",
			text: "Eve is waiting for input.",
		});
	});

	test("captures a chained gated write", () => {
		const parked = classifyParkedEveInput({
			requests: [
				{
					action: { input: { plan_id: "pro" }, toolName: "autumn__attach" },
					requestId: "req_2",
				},
			],
			skipRequestId: "req_1",
		});

		expect(parked).toEqual({
			chained: {
				input: { plan_id: "pro" },
				options: undefined,
				requestId: "req_2",
				toolName: "autumn__attach",
			},
			kind: "gated",
		});
	});

	test("captures an optioned question", () => {
		const parked = classifyParkedEveInput({
			requests: [
				{
					action: { toolName: "ask_question" },
					options: [{ id: "yes", label: "Yes" }],
					prompt: "Apply now?",
					requestId: "req_2",
				},
			],
		});

		expect(parked).toEqual({
			kind: "question",
			question: {
				options: [{ id: "yes", label: "Yes" }],
				prompt: "Apply now?",
				requestId: "req_2",
			},
		});
	});

	test("ignores the request that was just answered", () => {
		expect(
			classifyParkedEveInput({
				requests: [
					{
						action: { toolName: "autumn__attach" },
						prompt: "Approve?",
						requestId: "req_1",
					},
				],
				skipRequestId: "req_1",
			}),
		).toBeUndefined();
	});
});
