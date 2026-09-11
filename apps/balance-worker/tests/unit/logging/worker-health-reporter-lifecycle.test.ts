import { expect, test } from "bun:test";
import { createHealthReporterFixture } from "./health-reporter-fixture.js";

test.concurrent(
	"read failures are explicit and do not suppress later reports",
	() => {
		const { reporter, health, logs, warnings, timers } =
			createHealthReporterFixture();
		try {
			health.readFailure = true;
			expect(() => reporter.start()).not.toThrow();
			expect(warnings[0]?.[0]).toMatchObject({
				event: "balance_worker.health_error",
			});
			expect(logs).toEqual([]);
			health.readFailure = false;
			timers[0].run();
			expect(logs).toHaveLength(1);
		} finally {
			reporter.stop();
		}
	},
);

test.concurrent(
	"even a failing warning logger cannot stop future reports",
	() => {
		const { reporter, health, logs, timers } = createHealthReporterFixture();
		try {
			health.logFailure = true;
			expect(() => reporter.start()).not.toThrow();
			expect(timers).toHaveLength(1);
			expect(() => timers[0].run()).not.toThrow();
			health.logFailure = false;
			timers[0].run();
			expect(logs).toHaveLength(1);
		} finally {
			reporter.stop();
		}
	},
);

test.concurrent(
	"stop is final, idempotent and prevents late callbacks reading closed state",
	() => {
		const { reporter, health, logs, timers } = createHealthReporterFixture();
		try {
			reporter.start();
			expect(timers).toHaveLength(1);
			reporter.stop();
			reporter.stop();
			reporter.start();
			expect(timers[0].cancelled).toBe(true);
			health.readFailure = true;
			timers[0].run();
			expect(health.reads).toBe(1);
			expect(logs).toHaveLength(1);
			expect(timers).toHaveLength(1);
		} finally {
			reporter.stop();
		}
	},
);
