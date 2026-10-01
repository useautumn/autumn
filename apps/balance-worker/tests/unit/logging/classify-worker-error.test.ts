import { expect, test } from "bun:test";
import { classifyWorkerError } from "../../../src/logging/classifyWorkerError.js";
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

test("everything else is left to the default classifiers", () => {
	expect(classifyWorkerError({ error: new TypeError("x") })).toBeUndefined();
});
