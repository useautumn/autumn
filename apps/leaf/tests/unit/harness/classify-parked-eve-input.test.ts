import { describe, expect, test } from "bun:test";
import type { EveInputRequest } from "../../../src/internal/agentRuntime/eve/eveEventSchemas.js";
import {
	classifyParkedEveInput,
	siblingRequestIdsFromToolArgs,
} from "../../../src/internal/agentRuntime/eve/parkedInput.js";

const approvalRequest = ({
	input = {},
	requestId,
	toolName,
}: {
	input?: EveInputRequest["action"]["input"];
	requestId: string;
	toolName: string;
}): EveInputRequest => ({
	action: { callId: requestId, input, kind: "tool-call", toolName },
	allowFreeform: false,
	display: "confirmation",
	options: [
		{ id: "approve", label: "Yes" },
		{ id: "deny", label: "No" },
	],
	prompt: `Approve tool call: ${toolName}`,
	requestId,
});

const questionRequest = ({
	options,
	prompt,
	requestId,
}: {
	options?: ReadonlyArray<{ id: string; label: string }>;
	prompt: string;
	requestId: string;
}): EveInputRequest => ({
	action: {
		callId: requestId,
		input: { prompt },
		kind: "tool-call",
		toolName: "ask_question",
	},
	display: options ? "select" : "text",
	prompt,
	requestId,
	...(options ? { options: [...options] } : {}),
});

// Every park blocks the run until it is answered, so the only wrong answer is
// `undefined` — each case pins one park shape to the surface that can answer it.
describe("classifyParkedEveInput", () => {
	test("an option-less ask_question is text, not a gated write", () => {
		const parked = classifyParkedEveInput({
			requests: [
				questionRequest({
					prompt: "Which plan should I migrate them onto?",
					requestId: "req_2",
				}),
			],
			skipRequestId: "req_1",
		});

		expect(parked).toEqual({
			kind: "waiting",
			text: "Which plan should I migrate them onto?",
		});
	});

	test("captures a chained gated write", () => {
		const parked = classifyParkedEveInput({
			requests: [
				approvalRequest({
					input: { plan_id: "pro" },
					requestId: "req_2",
					toolName: "autumn__attach",
				}),
			],
			skipRequestId: "req_1",
		});

		expect(parked).toEqual({
			chained: {
				input: { plan_id: "pro" },
				options: [
					{ id: "approve", label: "Yes" },
					{ id: "deny", label: "No" },
				],
				requestId: "req_2",
				toolName: "autumn__attach",
			},
			kind: "gated",
			siblingRequestIds: [],
			withheld: [],
		});
	});

	test("captures an optioned question", () => {
		const parked = classifyParkedEveInput({
			requests: [
				questionRequest({
					options: [{ id: "yes", label: "Yes" }],
					prompt: "Apply now?",
					requestId: "req_2",
				}),
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
					approvalRequest({ requestId: "req_1", toolName: "autumn__attach" }),
				],
				skipRequestId: "req_1",
			}),
		).toBeUndefined();
	});

	// Eve holds every delivery until the whole parked batch is answered, so the
	// requests nobody gets a card for still have to be answerable.
	test("carries the rest of the batch as siblings of the picked write", () => {
		const parked = classifyParkedEveInput({
			requests: [
				approvalRequest({ requestId: "req_1", toolName: "autumn__attach" }),
				approvalRequest({
					requestId: "req_2",
					toolName: "autumn__updateSubscription",
				}),
				approvalRequest({
					requestId: "req_3",
					toolName: "autumn__updateCatalog",
				}),
			],
		});

		expect(parked).toMatchObject({
			chained: { requestId: "req_1" },
			kind: "gated",
			siblingRequestIds: ["req_2", "req_3"],
		});
	});

	// An approve/deny option id sent to an ask_question corrupts its answer, and
	// an unanswered question never blocks the batch anyway.
	test("leaves questions out of the siblings", () => {
		const parked = classifyParkedEveInput({
			requests: [
				approvalRequest({ requestId: "req_1", toolName: "autumn__attach" }),
				questionRequest({ prompt: "Which plan?", requestId: "req_2" }),
				approvalRequest({
					requestId: "req_5",
					toolName: "autumn__updateCatalog",
				}),
			],
		});

		expect(parked).toMatchObject({ siblingRequestIds: ["req_5"] });
	});

	test("excludes the answered request from the siblings", () => {
		const parked = classifyParkedEveInput({
			requests: [
				approvalRequest({ requestId: "req_1", toolName: "autumn__attach" }),
				approvalRequest({
					requestId: "req_2",
					toolName: "autumn__updateSubscription",
				}),
			],
			skipRequestId: "req_1",
		});

		expect(parked).toMatchObject({
			chained: { requestId: "req_2" },
			siblingRequestIds: [],
		});
	});
});

describe("siblingRequestIdsFromToolArgs", () => {
	test("reads the stashed ids", () => {
		expect(
			siblingRequestIdsFromToolArgs({
				_eveSiblingRequestIds: ["req_2", "req_3"],
				plan_id: "pro",
			}),
		).toEqual(["req_2", "req_3"]);
	});

	// Rows written before the key existed must not throw or invent siblings.
	test("has no siblings when the key is absent or not an array", () => {
		expect(siblingRequestIdsFromToolArgs({ plan_id: "pro" })).toEqual([]);
		expect(
			siblingRequestIdsFromToolArgs({ _eveSiblingRequestIds: "req_2" }),
		).toEqual([]);
		expect(siblingRequestIdsFromToolArgs(undefined)).toEqual([]);
		expect(siblingRequestIdsFromToolArgs("nonsense")).toEqual([]);
	});

	test("drops entries that are not strings", () => {
		expect(
			siblingRequestIdsFromToolArgs({
				_eveSiblingRequestIds: ["req_2", 7, null, "req_3"],
			}),
		).toEqual(["req_2", "req_3"]);
	});
});

// A withheld write whose tool name and input are dropped is unrecoverable: if
// the model never re-issues it, nothing knows the user asked for it.
describe("withheld sibling writes stay recoverable", () => {
	test("keeps the tool name and input of every withheld write", () => {
		const parked = classifyParkedEveInput({
			requests: [
				approvalRequest({
					input: { request: { customer_id: "cus_1", plan_id: "pro" } },
					requestId: "req_1",
					toolName: "autumn__attach",
				}),
				approvalRequest({
					input: { request: { customer_id: "cus_1", email: "new@x.com" } },
					requestId: "req_2",
					toolName: "autumn__updateCustomer",
				}),
			],
		});

		expect(parked).toMatchObject({
			kind: "gated",
			withheld: [
				{
					input: { request: { customer_id: "cus_1", email: "new@x.com" } },
					requestId: "req_2",
					toolName: "autumn__updateCustomer",
				},
			],
		});
	});
});
