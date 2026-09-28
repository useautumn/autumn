/**
 * Replay manifests rebase archived staging traffic onto a captured baseline
 * clock while keeping archive provenance, body fields and archive order intact.
 */

import { describe, expect, test } from "bun:test";
import { buildReplayManifestCohorts } from "@/internal/balances/replay/manifest/buildReplayManifestCohorts.js";
import { parseReplayManifest } from "@/internal/balances/replay/manifest/parseReplayManifest.js";

const BASELINE_CAPTURED_AT_MS = 1_775_000_000_000;
const WINDOW_START_MS = 1_774_000_000_000;
const WINDOW_END_MS = WINDOW_START_MS + 600_000;
const FIRST_ARCHIVED_AT_MS = WINDOW_START_MS + 1_000;

const buildRequestInput = (overrides: Record<string, unknown> = {}) => ({
	id: "obs_1",
	archivedAtMs: FIRST_ARCHIVED_AT_MS,
	orgId: "org_replay",
	env: "live",
	customerId: "cus_replay",
	operation: "track",
	body: { customer_id: "cus_replay", feature_id: "messages", value: 2 },
	...overrides,
});

const buildManifestInput = (overrides: Record<string, unknown> = {}) => ({
	baseline: { id: "baseline_replay", capturedAtMs: BASELINE_CAPTURED_AT_MS },
	window: { startMs: WINDOW_START_MS, endMs: WINDOW_END_MS },
	requests: [buildRequestInput()],
	...overrides,
});

const parseManifestWith = (overrides: Record<string, unknown> = {}) =>
	parseReplayManifest({ input: buildManifestInput(overrides) });

const parseRequests = (requests: unknown[]) =>
	parseManifestWith({ requests }).requests;

const parseSingleRequest = (overrides: Record<string, unknown> = {}) =>
	parseRequests([buildRequestInput(overrides)])[0];

const cohortsFor = (requests: unknown[]) =>
	buildReplayManifestCohorts({ manifest: parseManifestWith({ requests }) });

const requestIdOf = (request: { id: string }) => request.id;

const identityOf = (cohort: {
	identity: { orgId: string; env: string; customerId: string };
}) => cohort.identity;

const overwriteProvenance = (request: {
	provenance: { archivedAtMs: number };
}) => {
	request.provenance.archivedAtMs = 0;
};

describe("Replay manifest parsing", () => {
	test.concurrent("rebases archived timestamps onto the baseline clock", () => {
		const offsetMs = 45_000;
		const archivedAtMs = WINDOW_START_MS + offsetMs;
		const request = parseSingleRequest({
			archivedAtMs,
			body: {
				customer_id: "cus_replay",
				feature_id: "messages",
				timestamp: archivedAtMs,
			},
		});

		expect(request.logicalTimestampMs).toBe(BASELINE_CAPTURED_AT_MS + offsetMs);
		expect(request.body.timestamp).toBe(BASELINE_CAPTURED_AT_MS + offsetMs);
	});

	test.concurrent("leaves check bodies unstamped", () => {
		const request = parseSingleRequest({
			operation: "check",
			body: { customer_id: "cus_replay", feature_id: "messages" },
		});

		expect(request.body).not.toHaveProperty("timestamp");
		expect(request.logicalTimestampMs).toBe(BASELINE_CAPTURED_AT_MS + 1_000);
	});

	test.concurrent("records immutable archive provenance", () => {
		const request = parseSingleRequest();

		expect(request.provenance).toEqual({
			archivedAtMs: FIRST_ARCHIVED_AT_MS,
			archiveWindowStartMs: WINDOW_START_MS,
			archiveWindowEndMs: WINDOW_END_MS,
		});
		expect(() => overwriteProvenance(request)).toThrow();
		expect(request.provenance.archivedAtMs).toBe(FIRST_ARCHIVED_AT_MS);
	});

	test.concurrent(
		"clones request bodies so caller mutation cannot alter parsed data",
		() => {
			const body = { customer_id: "cus_replay", feature_id: "messages" };
			const input = buildManifestInput({
				requests: [buildRequestInput({ body })],
			});
			const manifest = parseReplayManifest({ input });

			body.feature_id = "mutated";

			expect(manifest.requests[0].body.feature_id).toBe("messages");
		},
	);

	test.concurrent("preserves every archived body field", () => {
		const body = {
			customer_id: "cus_replay",
			feature_id: "messages",
			entity_id: "ent_seat_1",
			event_name: "message_sent",
			idempotency_key: "idem_1",
			properties: { region: "eu" },
			value: 3,
			unsupported_option: { retain: true },
		};
		const request = parseSingleRequest({ body });

		expect(request.body).toEqual({
			...body,
			timestamp: request.logicalTimestampMs,
		});
	});

	test.concurrent(
		"supplies customer_id only when the archived body omits it",
		() => {
			const request = parseSingleRequest({
				body: { feature_id: "messages", value: 1 },
			});

			expect(request.body.customer_id).toBe("cus_replay");
		},
	);

	test.concurrent(
		"refuses bodies whose customer_id disagrees with the envelope",
		() => {
			expect(() =>
				parseSingleRequest({
					body: { customer_id: "cus_other", feature_id: "messages" },
				}),
			).toThrow(/customer_id/);
		},
	);

	test.concurrent(
		"refuses archived timestamps outside the manifest window",
		() => {
			expect(() =>
				parseSingleRequest({ archivedAtMs: WINDOW_START_MS - 1 }),
			).toThrow(/window/i);
			expect(() =>
				parseSingleRequest({ archivedAtMs: WINDOW_END_MS + 1 }),
			).toThrow(/window/i);
		},
	);

	test.concurrent(
		"refuses logical timestamps that leave the safe integer range",
		() => {
			expect(() =>
				parseManifestWith({
					baseline: {
						id: "baseline_overflow",
						capturedAtMs: Number.MAX_SAFE_INTEGER - 1,
					},
				}),
			).toThrow(/safe integer/i);
		},
	);

	test.concurrent("refuses malformed manifest envelopes", () => {
		const invalidManifests: Record<string, unknown>[] = [
			{ baseline: { id: "", capturedAtMs: BASELINE_CAPTURED_AT_MS } },
			{ baseline: { id: "baseline_replay", capturedAtMs: -1 } },
			{ baseline: { id: "baseline_replay", capturedAtMs: 1.5 } },
			{ window: { startMs: WINDOW_END_MS, endMs: WINDOW_START_MS } },
			{ window: { startMs: -1, endMs: WINDOW_END_MS } },
			{ requests: "many" },
		];

		for (const overrides of invalidManifests) {
			expect(() => parseManifestWith(overrides)).toThrow();
		}
	});

	test.concurrent("refuses malformed request envelopes", () => {
		const invalidRequests: Record<string, unknown>[] = [
			{ id: "" },
			{ orgId: "" },
			{ customerId: "" },
			{ env: "production" },
			{ operation: "meter" },
			{ archivedAtMs: -1 },
			{ archivedAtMs: FIRST_ARCHIVED_AT_MS + 0.5 },
			{ archivedAtMs: Number.NaN },
			{ body: null },
			{ body: "{}" },
			{ body: [] },
		];

		for (const overrides of invalidRequests) {
			expect(() => parseSingleRequest(overrides)).toThrow();
		}
	});

	test.concurrent(
		"refuses duplicate envelope ids but allows repeated idempotency keys",
		() => {
			const retriedBody = {
				customer_id: "cus_replay",
				feature_id: "messages",
				idempotency_key: "idem_retry",
				value: 1,
			};

			expect(() =>
				parseRequests([
					buildRequestInput({ id: "obs_1" }),
					buildRequestInput({
						id: "obs_1",
						archivedAtMs: FIRST_ARCHIVED_AT_MS + 5,
					}),
				]),
			).toThrow(/duplicate/i);

			expect(
				parseRequests([
					buildRequestInput({ id: "obs_1", body: retriedBody }),
					buildRequestInput({
						id: "obs_2",
						body: retriedBody,
						archivedAtMs: FIRST_ARCHIVED_AT_MS + 5,
					}),
				]),
			).toHaveLength(2);
		},
	);

	test.concurrent("preserves archive order instead of sorting requests", () => {
		const requests = parseRequests([
			buildRequestInput({
				id: "obs_late",
				archivedAtMs: WINDOW_START_MS + 30_000,
			}),
			buildRequestInput({
				id: "obs_early",
				archivedAtMs: WINDOW_START_MS + 10_000,
			}),
		]);

		expect(requests.map(requestIdOf)).toEqual(["obs_late", "obs_early"]);
	});
});

describe("Replay manifest cohorts", () => {
	test.concurrent(
		"keys cohorts by the full org, env and customer identity",
		() => {
			const cohorts = cohortsFor([
				buildRequestInput({ id: "obs_1" }),
				buildRequestInput({ id: "obs_2", env: "sandbox" }),
				buildRequestInput({ id: "obs_3", orgId: "org_other" }),
				buildRequestInput({
					id: "obs_4",
					customerId: "cus_other",
					body: { customer_id: "cus_other", feature_id: "messages" },
				}),
			]);

			expect(cohorts.map(identityOf)).toEqual([
				{ orgId: "org_replay", env: "live", customerId: "cus_replay" },
				{ orgId: "org_replay", env: "sandbox", customerId: "cus_replay" },
				{ orgId: "org_other", env: "live", customerId: "cus_replay" },
				{ orgId: "org_replay", env: "live", customerId: "cus_other" },
			]);
		},
	);

	test.concurrent(
		"unions and sorts concrete feature ids across the cohort",
		() => {
			const [cohort] = cohortsFor([
				buildRequestInput({
					id: "obs_1",
					body: { customer_id: "cus_replay", feature_id: "messages" },
				}),
				buildRequestInput({
					id: "obs_2",
					body: { customer_id: "cus_replay", feature_id: "credits" },
				}),
				buildRequestInput({
					id: "obs_3",
					body: { customer_id: "cus_replay", feature_id: "messages" },
				}),
			]);

			expect(cohort.featureIds).toEqual(["credits", "messages"]);
			expect(cohort.requestCount).toBe(3);
			expect(cohort.requests.map(requestIdOf)).toEqual([
				"obs_1",
				"obs_2",
				"obs_3",
			]);
			expect(cohort.requests[0].logicalTimestampMs).toBe(
				BASELINE_CAPTURED_AT_MS + 1_000,
			);
		},
	);

	test.concurrent(
		"keeps cohorts whose requests have no identifiable feature",
		() => {
			const [cohort] = cohortsFor([
				buildRequestInput({
					id: "obs_event_only",
					body: { customer_id: "cus_replay", event_name: "message_sent" },
				}),
				buildRequestInput({
					id: "obs_product_only",
					operation: "check",
					body: { customer_id: "cus_replay", product_id: "pro" },
				}),
			]);

			expect(cohort.featureIds).toEqual([]);
			expect(cohort.requestCount).toBe(2);
		},
	);

	test.concurrent(
		"ignores blank and non-string feature ids while still counting requests",
		() => {
			const [cohort] = cohortsFor([
				buildRequestInput({
					id: "obs_1",
					body: { customer_id: "cus_replay", feature_id: "" },
				}),
				buildRequestInput({
					id: "obs_2",
					body: { customer_id: "cus_replay", feature_id: 7 },
				}),
				buildRequestInput({
					id: "obs_3",
					body: { customer_id: "cus_replay", feature_id: "messages" },
				}),
			]);

			expect(cohort.featureIds).toEqual(["messages"]);
			expect(cohort.requestCount).toBe(3);
		},
	);
});
