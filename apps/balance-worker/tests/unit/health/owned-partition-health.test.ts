import { describe, expect, test } from "bun:test";
import {
	ownedPartitionFailureReasonOf,
	ownedPartitionHealthOf,
} from "../../../src/health/ownedPartitionHealth.js";

describe("owned partition health", () => {
	test("uses the freshest local or consumed position for lag", () => {
		expect(
			ownedPartitionHealthOf({
				topic: "metering-events-v1",
				partition: 2,
				status: "catching_up",
				localNextOffset: 8n,
				consumedNextOffset: 10n,
				highWatermark: 15n,
				failureReason: null,
			}),
		).toEqual({
			topic: "metering-events-v1",
			partition: 2,
			status: "catching_up",
			localNextOffset: 8n,
			consumedNextOffset: 10n,
			highWatermark: 15n,
			lag: 5n,
			failureReason: null,
		});
	});

	test("reports zero lag when consumed position includes the final commit marker", () => {
		const health = ownedPartitionHealthOf({
			topic: "metering-events-v1",
			partition: 2,
			status: "ready",
			localNextOffset: 41n,
			consumedNextOffset: 42n,
			highWatermark: 42n,
			failureReason: null,
		});

		expect(health.lag).toBe(0n);
	});

	test("does not report negative lag when the local writer is ahead", () => {
		const health = ownedPartitionHealthOf({
			topic: "metering-events-v1",
			partition: 2,
			status: "ready",
			localNextOffset: 43n,
			consumedNextOffset: 42n,
			highWatermark: 42n,
			failureReason: null,
		});

		expect(health.lag).toBe(0n);
	});

	test("keeps lag unknown until a high watermark has been observed", () => {
		const health = ownedPartitionHealthOf({
			topic: "metering-events-v1",
			partition: 2,
			status: "fencing",
			localNextOffset: null,
			consumedNextOffset: null,
			highWatermark: null,
			failureReason: null,
		});

		expect(health.lag).toBeNull();
	});

	test("names the root failure without exposing wrapper noise", () => {
		const rootCause = Object.assign(new Error("checkpoint fell behind"), {
			name: "PartitionBootstrapRefusedError",
			reason: "checkpoint_behind_log_start",
		});
		const wrapped = new Error("partition requires recovery", {
			cause: rootCause,
		});

		expect(ownedPartitionFailureReasonOf({ cause: wrapped })).toBe(
			"checkpoint_behind_log_start",
		);
	});
});
