import type { Kafka } from "kafkajs";
import { readTopicHighWatermarks } from "../../../consumer/partitionOffsets.js";
import { createPartitionReader } from "../../../consumer/reader/createPartitionReader.js";
import type { OwnershipLog } from "../types/ownershipLog.js";

export function createKafkaOwnershipLog({
	ctx,
	config,
}: {
	ctx: { kafka: Kafka };
	config: { topic: string };
}): OwnershipLog {
	const admin = ctx.kafka.admin();
	const reader = createPartitionReader({
		ctx,
		config: { topic: config.topic, groupIdPrefix: "autumn-ownership-log" },
	});
	let adminConnected = false;
	let connecting: Promise<void> | undefined;
	async function connectAdmin(): Promise<void> {
		await admin.connect();
		adminConnected = true;
	}
	async function fetchHighWatermarks(): Promise<ReadonlyMap<number, bigint>> {
		if (!adminConnected) {
			connecting ??= connectAdmin();
			try {
				await connecting;
			} finally {
				connecting = undefined;
			}
		}
		return readTopicHighWatermarks({
			ctx: { partitionOffsets: admin },
			topic: config.topic,
		});
	}
	async function disconnect(): Promise<void> {
		await reader.disconnect();
		await connecting;
		if (!adminConnected) return;
		await admin.disconnect();
		adminConnected = false;
	}
	const { readRange } = reader;
	return { fetchHighWatermarks, readRange, disconnect };
}
