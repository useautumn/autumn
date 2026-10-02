import { expect, test } from "bun:test";
import { classifyWorkerError } from "../../../src/logging/classifyWorkerError.js";
import { SubjectLoadBusyError } from "../../../src/processor/subject/subjectErrors.js";
import {
	OwnedPartitionNotReadyError,
	OwnedPartitionProducerFencedError,
	OwnedPartitionRecoveryRequiredError,
} from "../../../src/runtime/runtimeErrors.js";

test("partition lifecycle failures are infra", () => {
	expect(
		classifyWorkerError({
			error: new OwnedPartitionNotReadyError({ status: "activating" }),
		}),
	).toEqual({ kind: "infra", code: "partition_activating" });
	for (const error of [
		new OwnedPartitionRecoveryRequiredError({
			topic: "events",
			partition: 1,
			cause: null,
		}),
		new OwnedPartitionProducerFencedError({
			topic: "events",
			partition: 1,
			cause: null,
		}),
	]) {
		expect(classifyWorkerError({ error })?.kind).toBe("infra");
	}
});

test("a subject still loading at the caller's deadline is infra: nothing ran and the caller may retry", () => {
	expect(
		classifyWorkerError({
			error: new SubjectLoadBusyError({
				identity: {
					orgId: "org_1",
					env: "live",
					customerId: "cus_1",
					entityId: null,
				},
			}),
		}),
	).toEqual({ kind: "infra", code: "subject_load_busy" });
});

test("everything else is left to the default classifiers", () => {
	expect(classifyWorkerError({ error: new TypeError("x") })).toBeUndefined();
});
