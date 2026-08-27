import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type {
	EveAuthContext,
	EveSessionRef,
} from "../../../src/internal/agentRuntime/eve/types.js";

// `env` parses leaf's whole schema at import, so it is stubbed before the
// client is loaded — only the two values the request URL and headers read.
mock.module("../../../src/lib/env.js", () => ({
	env: {
		EVE_INTERNAL_AUTH_TOKEN: "internal_token",
		EVE_SERVER_URL: "http://eve.test",
	},
}));

const { postEveInputResponse, SIBLING_WITHHELD_NOTE } = await import(
	"../../../src/internal/agentRuntime/eve/client.js"
);

type PostedBody = {
	continuationToken: string;
	inputResponses: { optionId: string; requestId: string }[];
	message?: string;
};

let postedBodies: PostedBody[] = [];
const realFetch = globalThis.fetch;

const auth = {
	appEnv: AppEnv.Sandbox,
	channelId: "C1",
	orgId: "org_1",
	provider: "slack",
	providerUserId: "U1",
	threadId: "thread_1",
	workspaceId: "T1",
} satisfies EveAuthContext;

const session: EveSessionRef = {
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "eve_session_1",
	state: {
		continuationToken: "token_1",
		streamIndex: 3,
		pendingRequests: [],
	},
	threadKey: "sandbox:slack:T1:C1:thread_1",
};

describe("postEveInputResponse", () => {
	afterAll(() => {
		globalThis.fetch = realFetch;
	});

	beforeEach(() => {
		postedBodies = [];
		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			postedBodies.push(JSON.parse(String(init.body)) as PostedBody);
			return new Response(
				JSON.stringify({
					continuationToken: "token_2",
					sessionId: "eve_session_1",
				}),
				{ headers: { "content-type": "application/json" } },
			);
		}) as unknown as typeof fetch;
	});

	const post = ({
		approveSiblings,
		note,
		optionId = "approve",
		siblingRequestIds,
	}: {
		approveSiblings?: boolean;
		note?: string;
		optionId?: string;
		siblingRequestIds?: string[];
	}) =>
		postEveInputResponse({
			approveSiblings,
			auth,
			note,
			optionId,
			requestId: "req_1",
			session,
			siblingRequestIds,
		});

	// A single-request park is the overwhelming majority of answers and the
	// shape stored rows predating siblings still produce.
	test("posts exactly one answer when there are no siblings", async () => {
		await post({ note: "(a note)" });

		expect(postedBodies[0]).toEqual({
			continuationToken: "token_1",
			inputResponses: [{ optionId: "approve", requestId: "req_1" }],
			message: "(a note)",
		});
	});

	test("leaves the note alone when siblings are an empty list", async () => {
		await post({ note: "(a note)", siblingRequestIds: [] });

		expect(postedBodies[0]?.message).toBe("(a note)");
		expect(postedBodies[0]?.inputResponses).toHaveLength(1);
	});

	test("denies every sibling while keeping the caller's own option", async () => {
		await post({
			optionId: "approve",
			siblingRequestIds: ["req_2", "req_3"],
		});

		expect(postedBodies[0]?.inputResponses).toEqual([
			{ optionId: "approve", requestId: "req_1" },
			{ optionId: "deny", requestId: "req_2" },
			{ optionId: "deny", requestId: "req_3" },
		]);
	});

	// Eve rejects a repeated request id, and the park site can legitimately
	// re-list the answered request among the batch.
	test("dedupes siblings and drops the request being answered", async () => {
		await post({ siblingRequestIds: ["req_2", "req_2", "req_1", ""] });

		expect(postedBodies[0]?.inputResponses).toEqual([
			{ optionId: "approve", requestId: "req_1" },
			{ optionId: "deny", requestId: "req_2" },
		]);
	});

	test("tells the model the siblings were withheld, not rejected", async () => {
		await post({ note: "(a note)", siblingRequestIds: ["req_2"] });

		expect(postedBodies[0]?.message).toBe(
			`(a note)\n\n${SIBLING_WITHHELD_NOTE}`,
		);
	});

	test("sends the sibling note alone when the caller had none", async () => {
		await post({ siblingRequestIds: ["req_2"] });

		expect(postedBodies[0]?.message).toBe(SIBLING_WITHHELD_NOTE);
	});

	// The batch answer carries the caller's own option, so approving a grouped card
	// approves every write in it while every withdraw path still denies all of them.
	describe("batch answers follow the caller's option", () => {
		test("approves every request in an approved batch", async () => {
			await post({
				approveSiblings: true,
				optionId: "approve",
				siblingRequestIds: ["req_2", "req_3"],
			});

			expect(postedBodies[0]?.inputResponses).toEqual([
				{ optionId: "approve", requestId: "req_1" },
				{ optionId: "approve", requestId: "req_2" },
				{ optionId: "approve", requestId: "req_3" },
			]);
		});

		test("omits the withheld note when the batch was approved together", async () => {
			await post({
				approveSiblings: true,
				optionId: "approve",
				siblingRequestIds: ["req_2"],
			});

			expect(postedBodies[0]?.message).toBeUndefined();
		});

		// Dependent writes share a card, so the order the model issued them in is
		// the order they must be applied in.
		test("preserves the issued order of an approved batch", async () => {
			await post({
				approveSiblings: true,
				optionId: "approve",
				siblingRequestIds: ["req_2", "req_3", "req_4"],
			});

			expect(
				postedBodies[0]?.inputResponses.map((response) => response.requestId),
			).toEqual(["req_1", "req_2", "req_3", "req_4"]);
		});

		test("still denies every sibling on a withdraw", async () => {
			await post({ optionId: "deny", siblingRequestIds: ["req_2", "req_3"] });

			expect(postedBodies[0]?.inputResponses).toEqual([
				{ optionId: "deny", requestId: "req_1" },
				{ optionId: "deny", requestId: "req_2" },
				{ optionId: "deny", requestId: "req_3" },
			]);
		});
	});
});
