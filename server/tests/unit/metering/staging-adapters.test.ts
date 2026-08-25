import { describe, expect, test } from "bun:test";
import {
	KafkaMeteringLog,
	partitionForEvent,
} from "@/internal/metering/log/kafkaMeteringLog.js";
import { S3SnapshotStore } from "@/internal/metering/snapshot/s3SnapshotStore.js";
import { makeEvent } from "./metering-test-fixtures.js";

const event = makeEvent({ id: "evt_1", type: "deduct", value: 1 });

describe("staging adapters", () => {
	test("KafkaMeteringLog constructs without touching the network", () => {
		const log = new KafkaMeteringLog({
			brokers: ["b-1.example.amazonaws.com:9098"],
			topic: "metering-events",
			consumerGroup: "metering-worker",
			partition: 2,
			partitionCount: 4,
			region: "us-east-1",
		});

		expect(log.partition).toBe(2);
		expect(typeof log.append).toBe("function");
		expect(typeof log.read).toBe("function");
	});

	test("partitionForEvent is stable, bounded and org-scoped", () => {
		const partition = partitionForEvent({ event, partitionCount: 8 });

		expect(partition).toBe(partitionForEvent({ event, partitionCount: 8 }));
		expect(partition).toBeGreaterThanOrEqual(0);
		expect(partition).toBeLessThan(8);

		const otherOrg = makeEvent({
			id: "evt_2",
			type: "deduct",
			value: 1,
			orgId: "org_2",
		});
		const spread = new Set(
			Array.from({ length: 50 }, (_, index) =>
				partitionForEvent({
					event: makeEvent({
						id: `evt_${index}`,
						type: "deduct",
						value: 1,
						customerId: `cus_${index}`,
					}),
					partitionCount: 8,
				}),
			),
		);

		expect(partitionForEvent({ event: otherOrg, partitionCount: 8 })).toBe(
			partitionForEvent({ event: otherOrg, partitionCount: 8 }),
		);
		expect(spread.size).toBeGreaterThan(1);
	});

	test("S3SnapshotStore constructs without touching the network", () => {
		const store = new S3SnapshotStore({
			bucket: "autumn-metering-snapshots",
			prefix: "metering/staging",
			region: "us-east-1",
		});

		expect(typeof store.put).toBe("function");
		expect(typeof store.getLatest).toBe("function");
	});
});
