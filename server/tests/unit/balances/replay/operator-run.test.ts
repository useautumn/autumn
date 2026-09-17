/**
 * Whole-archive scheduling: the prewarm barrier, lane bounds, per-customer
 * ordering, totals reconciliation, phase timing and global pacing.
 */
import { describe, expect, it } from "bun:test";
import { runReplayArchive } from "@/internal/balances/replay/operator/runReplayArchive.js";
import { ReplayHydrationSourceRefusedError } from "@/internal/balances/replay/replayHydrationErrors.js";
import {
	buildReplayManifest,
	createArchiveRecord,
	createDeferred,
	createFakeCoordinator,
	createManualClock,
	createReadContextSpy,
	EVENT_NAME_REFUSAL_REASON,
	unsupportedCommandError,
} from "./operator-fixture.js";
import {
	createNotInitializedError,
	createReplayHydrationFixture,
	tick,
} from "./replay-hydration-fixture.js";

type ReplayArchiveReport = Awaited<ReturnType<typeof runReplayArchive>>;

const fixture = createReplayHydrationFixture();
const { readContext } = createReadContextSpy({ ctx: fixture.ctx });

const featureNotFoundCheck = () =>
	Promise.reject(unsupportedCommandError({ reason: "feature_not_found" }));
const featureNotFoundTrack = () =>
	Promise.reject(unsupportedCommandError({ reason: "feature_not_found" }));

const yieldingCheck = async () => {
	await tick();
	throw unsupportedCommandError({ reason: "feature_not_found" });
};
const yieldingTrack = async () => {
	await tick();
	throw unsupportedCommandError({ reason: "feature_not_found" });
};

function findRequestResult({
	report,
	id,
}: {
	report: ReplayArchiveReport;
	id: string;
}) {
	const result = report.requests.find((entry) => entry.id === id);
	if (!result) throw new Error(`missing replay result for ${id}`);
	return result;
}

function findCustomerStatus({
	report,
	customerId,
}: {
	report: ReplayArchiveReport;
	customerId: string;
}) {
	const status = report.prewarm.statuses.find(
		(entry) => entry.customerId === customerId,
	);
	if (!status) throw new Error(`missing customer status for ${customerId}`);
	return status;
}

function minimumGapOf({ times }: { times: readonly number[] }) {
	const ordered = [...times].sort((left, right) => left - right);
	let smallest = Number.POSITIVE_INFINITY;
	for (let index = 1; index < ordered.length; index += 1) {
		smallest = Math.min(
			smallest,
			(ordered[index] ?? 0) - (ordered[index - 1] ?? 0),
		);
	}
	return smallest;
}

function checkRecordsFor({ customerIds }: { customerIds: readonly string[] }) {
	return customerIds.map((customerId, index) =>
		createArchiveRecord({
			customerId,
			offsetMs: 1_000 + index,
			body: { feature_id: "messages" },
		}),
	);
}

describe("runReplayArchive", () => {
	it("blocks every measured request until all prewarms settle", async () => {
		const gate = createDeferred<void>();
		const { coordinator, calls } = createFakeCoordinator({
			onPrewarm: async ({ selection }) => {
				if (selection.identity.customerId === "cus_slow") await gate.promise;
				return { kind: "initialized", freshParity: true };
			},
			onCheck: featureNotFoundCheck,
		});
		const manifest = buildReplayManifest({
			records: checkRecordsFor({ customerIds: ["cus_fast", "cus_slow"] }),
		});
		const run = runReplayArchive({ manifest, coordinator, readContext });
		await tick();
		await tick();
		expect(calls.some((call) => call.operation === "check")).toBe(false);
		gate.resolve();
		const report = await run;
		expect(calls.filter((call) => call.operation === "check")).toHaveLength(2);
		expect(report.totals.selected).toBe(2);
	});

	it("bounds prewarm and execution to four customer lanes", async () => {
		const gate = createDeferred<void>();
		const { coordinator, state } = createFakeCoordinator({
			onPrewarm: async () => {
				await gate.promise;
				return { kind: "initialized", freshParity: true };
			},
			onCheck: yieldingCheck,
		});
		const manifest = buildReplayManifest({
			records: checkRecordsFor({
				customerIds: Array.from(
					{ length: 6 },
					(_unused, index) => `cus_${index}`,
				),
			}),
		});
		const run = runReplayArchive({ manifest, coordinator, readContext });
		await tick();
		await tick();
		expect(state.maxActivePrewarm).toBe(4);
		gate.resolve();
		await run;
		expect(state.maxActiveCustomers).toBeLessThanOrEqual(4);
	});

	it("replays each customer's requests in manifest order without overlap", async () => {
		const { coordinator, calls, state } = createFakeCoordinator({
			onCheck: yieldingCheck,
			onTrack: yieldingTrack,
		});
		const records = [
			createArchiveRecord({
				customerId: "cus_one",
				operation: "track",
				offsetMs: 1_000,
				body: { feature_id: "messages", value: 2 },
			}),
			createArchiveRecord({
				customerId: "cus_one",
				operation: "track",
				offsetMs: 2_000,
				body: { feature_id: "messages", value: 3 },
			}),
			createArchiveRecord({
				customerId: "cus_one",
				operation: "check",
				offsetMs: 3_000,
				body: { feature_id: "messages" },
			}),
		];
		const report = await runReplayArchive({
			manifest: buildReplayManifest({ records }),
			coordinator,
			readContext,
		});
		expect(
			calls
				.filter((call) => call.operation !== "prewarm")
				.map((call) => call.operation),
		).toEqual(["track", "track", "check"]);
		expect(state.maxActivePerCustomer).toBe(1);
		expect(report.requests.map((entry) => entry.id)).toEqual(
			records.map((record) => record.id),
		);
	});

	it("keeps request refusals visible when the baseline is unverified", async () => {
		const { coordinator, calls } = createFakeCoordinator({
			onPrewarm: () =>
				Promise.resolve({ kind: "already_ready", freshParity: false }),
		});
		const refused = createArchiveRecord({
			customerId: "cus_dup",
			operation: "check",
			body: { feature_id: "messages", entity_id: "ent_1" },
		});
		const excluded = createArchiveRecord({
			customerId: "cus_dup",
			operation: "check",
			offsetMs: 2_000,
			body: { feature_id: "messages" },
		});
		const report = await runReplayArchive({
			manifest: buildReplayManifest({ records: [refused, excluded] }),
			coordinator,
			readContext,
		});
		expect(findRequestResult({ report, id: refused.id })).toMatchObject({
			kind: "refused",
			reason: "entity_not_supported",
		});
		expect(findRequestResult({ report, id: excluded.id })).toMatchObject({
			kind: "refused",
			reason: "unverified_baseline",
		});
		expect(calls.filter((call) => call.operation !== "prewarm")).toHaveLength(
			0,
		);
		expect(findCustomerStatus({ report, customerId: "cus_dup" })).toMatchObject(
			{
				status: "excluded",
				requestCount: 2,
			},
		);
		expect(report.prewarm.results).toMatchObject({ already_ready: 1 });
		expect(report.prewarm.customers).toEqual({
			selected: 1,
			admitted: 0,
			excluded: 1,
			failed: 0,
		});
	});

	it("reconciles totals across setup failures, source refusals and execution failures", async () => {
		const { coordinator } = createFakeCoordinator({
			onPrewarm: ({ selection }) => {
				const customerId = selection.identity.customerId;
				if (customerId === "cus_setup")
					return Promise.reject(new Error("prewarm_crashed"));
				if (customerId === "cus_missing")
					return Promise.reject(
						new ReplayHydrationSourceRefusedError({
							category: "missing",
							reason: "baseline_not_found",
						}),
					);
				return Promise.resolve({ kind: "initialized", freshParity: true });
			},
			onTrack: () => Promise.reject(createNotInitializedError()),
			onCheck: featureNotFoundCheck,
		});
		const executionFailure = createArchiveRecord({
			customerId: "cus_ok",
			operation: "track",
			body: { feature_id: "messages", value: 1 },
		});
		const setupFailure = createArchiveRecord({
			customerId: "cus_setup",
			body: { feature_id: "messages" },
		});
		const sourceRefusal = createArchiveRecord({
			customerId: "cus_missing",
			body: { feature_id: "messages" },
		});
		const eventNameRefusal = createArchiveRecord({
			customerId: "cus_event",
			operation: "track",
			body: { event_name: "message.sent" },
		});
		const report = await runReplayArchive({
			manifest: buildReplayManifest({
				records: [
					executionFailure,
					setupFailure,
					sourceRefusal,
					eventNameRefusal,
				],
			}),
			coordinator,
			readContext,
		});
		expect(findRequestResult({ report, id: executionFailure.id }).kind).toBe(
			"failed",
		);
		expect(findRequestResult({ report, id: setupFailure.id }).kind).toBe(
			"failed",
		);
		expect(findRequestResult({ report, id: sourceRefusal.id })).toMatchObject({
			kind: "refused",
			reason: "baseline_not_found",
		});
		expect(
			findRequestResult({ report, id: eventNameRefusal.id }),
		).toMatchObject({ kind: "refused", reason: EVENT_NAME_REFUSAL_REASON });
		expect(
			findCustomerStatus({ report, customerId: "cus_event" }).requestCount,
		).toBe(1);
		expect(findCustomerStatus({ report, customerId: "cus_setup" }).status).toBe(
			"failed",
		);
		expect(report.totals).toEqual({
			selected: 4,
			admitted: 1,
			completed: 0,
			refused: 2,
			failed: 2,
			setupFailed: 1,
			executionFailed: 1,
		});
	});

	it("separates prewarm time from measured request work and pacing", async () => {
		const harness = createManualClock({ start: 1_000 });
		const { coordinator } = createFakeCoordinator({
			onPrewarm: () => {
				harness.advance({ durationMs: 100 });
				return Promise.resolve({ kind: "initialized", freshParity: true });
			},
			onCheck: () => {
				harness.advance({ durationMs: 10 });
				return featureNotFoundCheck();
			},
		});
		const report = await runReplayArchive({
			manifest: buildReplayManifest({
				records: [
					createArchiveRecord({
						customerId: "cus_timed",
						body: { feature_id: "messages" },
					}),
					createArchiveRecord({
						customerId: "cus_timed",
						offsetMs: 2_000,
						body: { feature_id: "messages" },
					}),
				],
			}),
			coordinator,
			readContext,
			config: { concurrency: 1, requestsPerSecond: 50 },
			clock: harness.clock,
		});
		expect(report.measurement).toBe("client_to_worker");
		expect(report.clock).toBe("rebased");
		expect(report.prewarmDurationMs).toBe(100);
		expect(harness.sleptMs()).toBeGreaterThan(0);
		expect(report.measuredDurationMs).toBe(20 + harness.sleptMs());
	});

	it("does not execute requests after cancellation", async () => {
		const controller = new AbortController();
		const gate = createDeferred<void>();
		const { coordinator, calls } = createFakeCoordinator({
			onPrewarm: async () => {
				await gate.promise;
				return { kind: "initialized", freshParity: true };
			},
			onCheck: featureNotFoundCheck,
		});
		const run = runReplayArchive({
			manifest: buildReplayManifest({
				records: [
					createArchiveRecord({
						customerId: "cus_cancel",
						body: { feature_id: "messages" },
					}),
					createArchiveRecord({
						customerId: "cus_cancel",
						offsetMs: 2_000,
						body: { feature_id: "messages" },
					}),
				],
			}),
			coordinator,
			readContext,
			signal: controller.signal,
		});
		await tick();
		controller.abort();
		gate.resolve();
		const report = await run;
		expect(calls.some((call) => call.operation === "check")).toBe(false);
		expect(report.totals.completed).toBe(0);
		expect(report.totals.selected).toBe(2);
		expect(report.totals.selected).toBe(
			report.totals.completed + report.totals.refused + report.totals.failed,
		);
	});

	it("spaces measured requests globally across concurrent lanes", async () => {
		const harness = createManualClock();
		const config = { concurrency: 2, requestsPerSecond: 50 };
		const intervalMs = 1_000 / config.requestsPerSecond;
		const startTimes: number[] = [];
		const { coordinator } = createFakeCoordinator({
			onCheck: () => {
				startTimes.push(harness.clock.now());
				return featureNotFoundCheck();
			},
			onTrack: featureNotFoundTrack,
		});
		await runReplayArchive({
			manifest: buildReplayManifest({
				records: checkRecordsFor({
					customerIds: ["cus_a", "cus_b", "cus_c", "cus_d"],
				}),
			}),
			coordinator,
			readContext,
			config,
			clock: harness.clock,
		});
		expect(startTimes).toHaveLength(4);
		expect(minimumGapOf({ times: startTimes })).toBeGreaterThanOrEqual(
			intervalMs,
		);
	});
});
