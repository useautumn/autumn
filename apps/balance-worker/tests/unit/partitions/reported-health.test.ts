import { describe, expect, test } from "bun:test";
import { ownedPartitionHealthOf } from "../../../src/health/ownedPartitionHealth.js";
import { reportedHealthOf } from "../../../src/partitions/health/partitionHealth.js";

const health = ownedPartitionHealthOf({
	topic: "metering",
	partition: 3,
	status: "ready",
	localNextOffset: 10n,
	consumedNextOffset: 10n,
	highWatermark: 10n,
	failureReason: null,
});

const subjectMap = {
	residentSubjects: 2,
	residentBytes: 4_096,
	droppedSubjects: {
		capacity: 5,
		idle: 0,
		evict: 1,
		stale: 0,
		storeRejected: 0,
		coldStart: 0,
	},
};

describe("reported partition health", () => {
	test("a runtime with a subject map reports its usage beside its health", () => {
		expect(
			reportedHealthOf({
				runtime: {
					getHealth: () => health,
					readSubjectMapUsage: () => subjectMap,
				},
			}),
		).toEqual({ ...health, subjectMap });
	});

	test("a runtime without one reports its health unchanged", () => {
		expect(reportedHealthOf({ runtime: { getHealth: () => health } })).toBe(
			health,
		);
	});
});
