import { describe, expect, test } from "bun:test";
import {
	createDatabaseReporter,
	createDatabaseTimings,
	timeQuery,
} from "../../../src/logging/databaseTimings.js";

function postgresError({ code }: { code: string }) {
	return Object.assign(new Error("Max lifetime timeout reached after 30m"), {
		code,
	});
}

describe("database timings", () => {
	test("summarise each query kind, its error codes, and the most queries in flight at once", async () => {
		const timings = createDatabaseTimings();
		let finishLoad = () => {};
		const load = timeQuery({
			ctx: { timings },
			kind: "subject_rows",
			run: () =>
				new Promise<string>((resolve) => {
					finishLoad = () => resolve("rows");
				}),
		});
		const killed = timeQuery({
			ctx: { timings },
			kind: "subject_rows",
			run: async () => {
				throw postgresError({ code: "ERR_POSTGRES_LIFETIME_TIMEOUT" });
			},
		});
		await expect(killed).rejects.toThrow("Max lifetime");
		finishLoad();
		expect(await load).toBe("rows");
		await timeQuery({ ctx: { timings }, kind: "flush", run: async () => 1 });

		const summary = timings.drain();
		expect(summary.inFlightMax).toBe(2);
		expect(summary.queries.subject_rows).toMatchObject({ count: 2, errors: 1 });
		expect(summary.queries.flush).toMatchObject({ count: 1, errors: 0 });
		expect(summary.errorCodes).toEqual({ ERR_POSTGRES_LIFETIME_TIMEOUT: 1 });

		const next = timings.drain();
		expect(next).toMatchObject({ inFlightMax: 0, queries: {}, errorCodes: {} });
	});

	test("the wait for a subject load slot is summarised apart from the query", () => {
		const timings = createDatabaseTimings();
		for (const waitMs of [0, 0, 40, 900])
			timings.recordSubjectLoadWait({ waitMs });

		expect(timings.drain().subjectLoadWait).toEqual({
			count: 4,
			p50: 0,
			p99: 900,
			max: 900,
		});
	});

	test("the reporter logs one line per window with the pool size and the gate as it stands", () => {
		const timings = createDatabaseTimings();
		timings.recordSubjectLoadWait({ waitMs: 12 });
		const logged: unknown[][] = [];
		let tick = () => {};
		const reporter = createDatabaseReporter({
			ctx: {
				logger: { info: (...args: unknown[]) => logged.push(args) },
				timings,
				gate: { snapshot: () => ({ running: 3, queued: 7 }) },
				schedule: ({ run }) => {
					tick = run;
					return () => {};
				},
			},
			config: {
				deployment: "prod",
				endpoint: "http://10.0.0.1:8082",
				poolSize: 32,
				subjectLoadConcurrency: 16,
			},
		});
		reporter.start();
		timings.recordSubjectLoadWait({ waitMs: 30 });
		tick();

		expect(logged).toHaveLength(1);
		expect(logged[0]?.[0]).toMatchObject({
			event: "balance_worker.database",
			workerDeployment: "prod",
			data: {
				workerEndpoint: "http://10.0.0.1:8082",
				poolSize: 32,
				subjectLoads: {
					concurrency: 16,
					running: 3,
					queued: 7,
					wait: { count: 1, max: 30 },
				},
			},
		});
		expect(logged[0]?.[1]).toBe("Balance worker database");
		reporter.stop();
	});
});
