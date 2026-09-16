/**
 * Planning and single-request execution over parsed manifest requests.
 */
import { describe, expect, it } from "bun:test";
import { executeReplayRequest } from "@/internal/balances/replay/operator/executeReplayRequest.js";
import { planReplayRequest } from "@/internal/balances/replay/operator/planReplayRequest.js";
import { ReplayHydrationSourceRefusedError } from "@/internal/balances/replay/replayHydrationErrors.js";
import {
	ARCHIVE_WINDOW,
	buildReplayRequest,
	createArchiveRecord,
	createFakeCoordinator,
	createReadContextSpy,
	EVENT_NAME_REFUSAL_REASON,
	REPLAY_BASELINE,
	unsupportedTrackDecision,
} from "./operator-fixture.js";
import {
	createNotInitializedError,
	createReplayHydrationFixture,
} from "./replay-hydration-fixture.js";

type ReplayRequestPlan = ReturnType<typeof planReplayRequest>;
type ReplayExecutionResult = Awaited<ReturnType<typeof executeReplayRequest>>;

function expectCheckPlan({ plan }: { plan: ReplayRequestPlan }) {
	if (plan.kind !== "check")
		throw new Error(`expected check plan, received ${plan.kind}`);
	return plan.command;
}

function expectTrackPlan({ plan }: { plan: ReplayRequestPlan }) {
	if (plan.kind !== "track")
		throw new Error(`expected track plan, received ${plan.kind}`);
	return plan.command;
}

function expectPlanRefusal({ plan }: { plan: ReplayRequestPlan }) {
	if (plan.kind !== "refused")
		throw new Error(`expected refusal, received ${plan.kind}`);
	return plan.reason;
}

function expectExecutionFailure({ result }: { result: ReplayExecutionResult }) {
	if (result.kind !== "failed")
		throw new Error(`expected failure, received ${result.kind}`);
	return result.reason;
}

const unsupportedShapeCases = [
	{
		name: "entity",
		operation: "check",
		body: { feature_id: "messages", entity_id: "ent_1" },
		reason: "entity_not_supported",
	},
	{
		name: "properties",
		operation: "track",
		body: {
			feature_id: "messages",
			value: 1,
			properties: { source: "archive" },
		},
		reason: "properties_not_supported",
	},
	{
		name: "lock",
		operation: "check",
		body: {
			feature_id: "messages",
			lock: { lock_id: "lock_replay", enabled: true },
		},
		reason: "lock_not_supported",
	},
	{
		name: "expand",
		operation: "check",
		body: { feature_id: "messages", expand: ["balance.feature"] },
		reason: "expand_not_supported",
	},
	{
		name: "product check",
		operation: "check",
		body: { product_id: "pro" },
		reason: "product_check_not_supported",
	},
	{
		name: "check and track",
		operation: "check",
		body: { feature_id: "messages", send_event: true },
		reason: "check_and_track_not_supported",
	},
	{
		name: "preview",
		operation: "check",
		body: { feature_id: "messages", with_preview: true },
		reason: "preview_not_supported",
	},
	{
		name: "event name",
		operation: "track",
		body: { event_name: "message.sent" },
		reason: EVENT_NAME_REFUSAL_REASON,
	},
] as const;

describe("planReplayRequest", () => {
	it("plans a check command on the rebased logical clock", () => {
		const request = buildReplayRequest({
			record: createArchiveRecord({
				customerId: "cus_plan",
				operation: "check",
				body: { feature_id: "messages", required_balance: 3 },
			}),
		});
		const command = expectCheckPlan({ plan: planReplayRequest({ request }) });
		expect(command.requestId).toBe(request.id);
		expect(command.occurredAt).toBe(request.logicalTimestampMs);
		expect(command.requiredBalance).toBe(3);
		expect(command.identity).toEqual({
			orgId: request.orgId,
			env: "sandbox",
			customerId: "cus_plan",
		});
	});

	it("rebases the archived body timestamp onto the baseline clock", () => {
		const archivedTimestampMs = ARCHIVE_WINDOW.startMs + 5_000;
		const request = buildReplayRequest({
			record: createArchiveRecord({
				operation: "track",
				offsetMs: 5_000,
				body: {
					feature_id: "messages",
					value: 2,
					timestamp: archivedTimestampMs,
				},
			}),
		});
		expect(request.provenance.archivedAtMs).toBe(archivedTimestampMs);
		expect(request.logicalTimestampMs).toBe(
			REPLAY_BASELINE.capturedAtMs + 5_000,
		);
		expect(request.body.timestamp).toBe(request.logicalTimestampMs);
		const command = expectTrackPlan({ plan: planReplayRequest({ request }) });
		expect(command.occurredAt).toBe(request.logicalTimestampMs);
		expect(command.occurredAt).not.toBe(archivedTimestampMs);
	});

	it("keeps track command identity stable across archived retries", () => {
		const body = {
			feature_id: "messages",
			value: 5,
			idempotency_key: "idem_1",
		};
		const first = buildReplayRequest({
			record: createArchiveRecord({ operation: "track", body }),
		});
		const retry = buildReplayRequest({
			record: createArchiveRecord({ operation: "track", body }),
		});
		const firstCommand = expectTrackPlan({
			plan: planReplayRequest({ request: first }),
		});
		const retryCommand = expectTrackPlan({
			plan: planReplayRequest({ request: retry }),
		});
		expect(firstCommand.commandId).toBe(retryCommand.commandId);
		expect(firstCommand.requestId).toBe(first.id);
		expect(retryCommand.requestId).toBe(retry.id);
		expect(firstCommand.value).toBe(5);
	});

	it("plans logical live requests", () => {
		const request = buildReplayRequest({
			record: createArchiveRecord({
				env: "live",
				operation: "check",
				body: { feature_id: "messages" },
			}),
		});
		const command = expectCheckPlan({ plan: planReplayRequest({ request }) });
		expect(command.identity.env).toBe("live");
	});

	for (const testCase of unsupportedShapeCases) {
		it(`refuses archived ${testCase.name} requests`, () => {
			const request = buildReplayRequest({
				record: createArchiveRecord({
					operation: testCase.operation,
					body: testCase.body,
				}),
			});
			expect(expectPlanRefusal({ plan: planReplayRequest({ request }) })).toBe(
				testCase.reason,
			);
		});
	}

	it("refuses bodies that fail schema validation as request_invalid", () => {
		const badValue = buildReplayRequest({
			record: createArchiveRecord({
				operation: "track",
				body: { feature_id: "messages", value: "five" },
			}),
		});
		const badLock = buildReplayRequest({
			record: createArchiveRecord({
				operation: "check",
				body: { feature_id: "messages", lock: { lock_id: "lock_replay" } },
			}),
		});
		expect(
			expectPlanRefusal({ plan: planReplayRequest({ request: badValue }) }),
		).toBe("request_invalid");
		expect(
			expectPlanRefusal({ plan: planReplayRequest({ request: badLock }) }),
		).toBe("request_invalid");
	});
});

describe("executeReplayRequest", () => {
	const fixture = createReplayHydrationFixture();

	it("refuses unsupported requests without touching the coordinator or context", async () => {
		const { coordinator, calls } = createFakeCoordinator();
		const { readContext, identities } = createReadContextSpy({
			ctx: fixture.ctx,
		});
		const result = await executeReplayRequest({
			request: buildReplayRequest({
				record: createArchiveRecord({
					operation: "check",
					body: { feature_id: "messages", entity_id: "ent_1" },
				}),
			}),
			selection: fixture.selection,
			coordinator,
			readContext,
		});
		expect(result).toEqual({ kind: "refused", reason: "entity_not_supported" });
		expect(calls).toHaveLength(0);
		expect(identities).toHaveLength(0);
	});

	it("sends the planned command and refuses engine-unsupported decisions", async () => {
		const { coordinator, trackCommands } = createFakeCoordinator({
			onTrack: () =>
				Promise.resolve(
					unsupportedTrackDecision({ reason: "feature_not_found" }),
				),
		});
		const { readContext } = createReadContextSpy({ ctx: fixture.ctx });
		const request = buildReplayRequest({
			record: createArchiveRecord({
				customerId: fixture.selection.identity.customerId,
				operation: "track",
				body: { feature_id: "messages", value: 5 },
			}),
		});
		const result = await executeReplayRequest({
			request,
			selection: fixture.selection,
			coordinator,
			readContext,
		});
		expect(result).toEqual({ kind: "refused", reason: "feature_not_found" });
		expect(trackCommands[0]?.requestId).toBe(request.id);
		expect(trackCommands[0]?.occurredAt).toBe(request.logicalTimestampMs);
	});

	it("refuses when the coordinator surfaces a source refusal", async () => {
		const { coordinator } = createFakeCoordinator({
			onCheck: () =>
				Promise.reject(
					new ReplayHydrationSourceRefusedError({
						category: "unsupported",
						reason: "legacy_baseline_shape",
					}),
				),
		});
		const { readContext } = createReadContextSpy({ ctx: fixture.ctx });
		const result = await executeReplayRequest({
			request: buildReplayRequest({
				record: createArchiveRecord({
					customerId: fixture.selection.identity.customerId,
					operation: "check",
					body: { feature_id: "messages" },
				}),
			}),
			selection: fixture.selection,
			coordinator,
			readContext,
		});
		expect(result).toEqual({
			kind: "refused",
			reason: "legacy_baseline_shape",
		});
	});

	it("fails without throwing when the worker transport errors", async () => {
		const { coordinator } = createFakeCoordinator({
			onTrack: () => Promise.reject(createNotInitializedError()),
		});
		const { readContext } = createReadContextSpy({ ctx: fixture.ctx });
		const result = await executeReplayRequest({
			request: buildReplayRequest({
				record: createArchiveRecord({
					customerId: fixture.selection.identity.customerId,
					operation: "track",
					body: { feature_id: "messages", value: 1 },
				}),
			}),
			selection: fixture.selection,
			coordinator,
			readContext,
		});
		expect(expectExecutionFailure({ result }).length).toBeGreaterThan(0);
	});
});
