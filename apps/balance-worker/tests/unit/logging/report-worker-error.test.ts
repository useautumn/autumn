import { expect, test } from "bun:test";
import { reportWorkerError } from "../../../src/logging/reportWorkerError.js";
import {
	PartitionHandoffCancelledError,
	PartitionRetiredError,
} from "../../../src/partitions/lifecycle/partitionLifecycleErrors.js";
import {
	OwnedPartitionNotReadyError,
	OwnedPartitionRecoveryRequiredError,
} from "../../../src/runtime/runtimeErrors.js";

function recordingLogger() {
	const lines: { level: "info" | "error"; message: string; data: unknown }[] =
		[];
	const logger = {
		info: (data: unknown, message: string) => {
			lines.push({ level: "info", message, data });
		},
		error: (data: unknown, message: string) => {
			lines.push({ level: "error", message, data });
		},
	};
	return { logger: logger as never, lines };
}

test("a partition let go by a retirement is information, with the chain kept", () => {
	const { logger, lines } = recordingLogger();
	const cause = new AggregateError(
		[new Error("claim wait ended", { cause: new PartitionRetiredError() })],
		"Partition retirement did not settle safely",
	);
	reportWorkerError({ logger, cause });
	expect(lines).toHaveLength(1);
	expect(lines[0]?.level).toBe("info");
	expect(lines[0]?.message).toBe(
		"Balance worker partition retired <- Error: claim wait ended <- PartitionRetiredError: Partition retired",
	);
});

test("work that reached a draining runtime, and a hand-off unwound, are information too", () => {
	const { logger, lines } = recordingLogger();
	reportWorkerError({
		logger,
		cause: new OwnedPartitionRecoveryRequiredError({
			topic: "events",
			partition: 3,
			cause: new OwnedPartitionNotReadyError({ status: "draining" }),
		}),
	});
	reportWorkerError({ logger, cause: new PartitionHandoffCancelledError() });
	expect(lines.map((line) => line.level)).toEqual(["info", "info"]);
	expect(lines[0]?.message).toStartWith(
		"Balance worker partition draining <- ",
	);
	expect(lines[1]?.message).toBe("Balance worker partition handoff cancelled");
});

test("anything else is still an error with its cause chain in the message", () => {
	const { logger, lines } = recordingLogger();
	reportWorkerError({
		logger,
		cause: new OwnedPartitionRecoveryRequiredError({
			topic: "events",
			partition: 3,
			cause: new OwnedPartitionNotReadyError({ status: "recovery_required" }),
		}),
	});
	reportWorkerError({ logger, cause: "not an error" });
	expect(lines.map((line) => line.level)).toEqual(["error", "error"]);
	expect(lines[0]?.message).toStartWith("Balance worker error <- ");
	expect(lines[1]?.message).toBe("Balance worker error");
});
