import { describe, expect, test } from "bun:test";
import {
	classifyParkedEveInput,
	siblingRequestIdsFromToolArgs,
} from "../../../src/harness/eve/classifyParkedInput.js";

// Every park blocks the run until it is answered, so the only wrong answer is
// `undefined` — each case pins one park shape to the surface that can answer it.
describe("classifyParkedEveInput", () => {
	test("an option-less ask_question is text, not a gated write", () => {
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

	// The skip filter compares ids; an id-less park must survive it rather than
	// be swept out with the answered one.
	test("a park with no request id survives the skip filter", () => {
		expect(
			classifyParkedEveInput({
				requests: [{ prompt: "Which plan?" }],
				skipRequestId: "req_1",
			}),
		).toEqual({ kind: "waiting", text: "Which plan?" });
	});

	test("an unanswerable gated write is surfaced as text, not a card", () => {
		expect(
			classifyParkedEveInput({
				// No requestId, so the resume path has nothing to answer eve with.
				requests: [
					{ action: { toolName: "autumn__attach" }, prompt: "Approve?" },
				],
			}),
		).toEqual({ kind: "waiting", text: "Approve?" });
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
			siblingRequestIds: [],
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

	// Eve holds every delivery until the whole parked batch is answered, so the
	// requests nobody gets a card for still have to be answerable.
	test("carries the rest of the batch as siblings of the picked write", () => {
		const parked = classifyParkedEveInput({
			requests: [
				{ action: { toolName: "autumn__attach" }, requestId: "req_1" },
				{
					action: { toolName: "autumn__updateSubscription" },
					requestId: "req_2",
				},
				{ action: { toolName: "autumn__updateCatalog" }, requestId: "req_3" },
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
	test("leaves questions and id-less requests out of the siblings", () => {
		const parked = classifyParkedEveInput({
			requests: [
				{ action: { toolName: "autumn__attach" }, requestId: "req_1" },
				{
					action: { toolName: "ask_question" },
					prompt: "Which plan?",
					requestId: "req_2",
				},
				{ action: { toolName: "autumn__updateSubscription" } },
				{ prompt: "Anything else?", requestId: "req_4" },
				{ action: { toolName: "autumn__updateCatalog" }, requestId: "req_5" },
			],
		});

		expect(parked).toMatchObject({ siblingRequestIds: ["req_5"] });
	});

	test("excludes the answered request from the siblings", () => {
		const parked = classifyParkedEveInput({
			requests: [
				{ action: { toolName: "autumn__attach" }, requestId: "req_1" },
				{
					action: { toolName: "autumn__updateSubscription" },
					requestId: "req_2",
				},
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
