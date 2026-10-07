import type { FileStats } from "@tw/worker/runTestFileWithStats.ts";
import {
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	real,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

/** Append-only: one `[tw-file-stats]` line per file attempt (Stripe load, CPU, memory). */
export const fileRunStats = pgTable(
	"file_run_stats",
	{
		id: text("id").primaryKey(),
		runId: text("run_id").notNull(),
		file: text("file").notNull(),
		/** 1-based repetition of a repeat run; null for normal runs. */
		repetition: integer("repetition"),
		attempt: integer("attempt").notNull(),
		worker: text("worker"),
		/** Worker size and region the sample ran on, e.g. "2c4g-us-east-1". */
		workerClass: text("worker_class").notNull(),
		stats: jsonb("stats").$type<FileStats>().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("file_run_stats_run_idx").on(t.runId)],
);

/** Rolling per-file EWMAs, folded in after every completed run; null until a sample carries the metric. */
export const fileProfiles = pgTable(
	"file_profiles",
	{
		file: text("file").notNull(),
		workerClass: text("worker_class").notNull(),
		samples: integer("samples").notNull(),
		statsSamples: integer("stats_samples").notNull().default(0),
		durationMeanMs: real("duration_mean_ms").notNull(),
		durationVariance: real("duration_variance").notNull().default(0),
		failRate: real("fail_rate").notNull().default(0),
		/** First-attempt failures while sharing a worker; well above failRate means the file must run alone. */
		packedSamples: integer("packed_samples").notNull().default(0),
		packedFailRate: real("packed_fail_rate"),
		stripeRequests: real("stripe_requests"),
		stripeTestRequests: real("stripe_test_requests"),
		stripeServerRequests: real("stripe_server_requests"),
		stripeMeanRps: real("stripe_mean_rps"),
		stripeMeanInFlight: real("stripe_mean_in_flight"),
		stripePeakRps: real("stripe_peak_rps"),
		stripePeakInFlight: real("stripe_peak_in_flight"),
		workerPeakRps: real("worker_peak_rps"),
		workerPeakInFlight: real("worker_peak_in_flight"),
		rateLimited: real("rate_limited"),
		permitWaitMs: real("permit_wait_ms"),
		permitWaitP95Ms: real("permit_wait_p95_ms"),
		cpuCoreSeconds: real("cpu_core_seconds"),
		cpuPeakCores: real("cpu_peak_cores"),
		memPeakMib: real("mem_peak_mib"),
		testCpuSeconds: real("test_cpu_seconds"),
		testPeakMib: real("test_peak_mib"),
		lastRunId: text("last_run_id").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.file, t.workerClass] })],
);
