import type { OwnershipLog } from "../types/ownershipLog.js";
import type { PartitionOwner } from "../types/partitionOwner.js";
import { applyOwnershipRecord, readOwnershipToEnd } from "./ownershipReplay.js";
import type { OwnershipConsumer } from "./types/ownershipConsumer.js";

export function createOwnershipConsumer({
	ctx,
}: {
	ctx: { log: OwnershipLog };
}): OwnershipConsumer {
	let owners = new Map<number, PartitionOwner>();
	let nextOffsetByPartition = new Map<number, bigint>();
	let status: "created" | "started" | "stopped" = "created";

	async function replay(): Promise<void> {
		const { entries, nextOffsetByPartition: nextOffsets } =
			await readOwnershipToEnd({
				log: ctx.log,
				fromOffsetByPartition: nextOffsetByPartition,
			});
		for (const entry of entries) {
			owners = applyOwnershipRecord({
				owners,
				record: entry.record,
				offset: entry.offset,
			});
		}
		nextOffsetByPartition = nextOffsets;
	}

	async function start(): Promise<void> {
		if (status !== "created") {
			throw new Error(`Ownership consumer cannot start while ${status}`);
		}
		await replay();
		status = "started";
	}

	async function refresh(): Promise<void> {
		if (status !== "started") {
			throw new Error(`Ownership consumer cannot refresh while ${status}`);
		}
		await replay();
	}

	function findOwner({
		partition,
	}: {
		partition: number;
	}): PartitionOwner | undefined {
		if (status !== "started") {
			throw new Error(
				`Ownership consumer cannot look up owners while ${status}`,
			);
		}
		return owners.get(partition);
	}

	async function stop(): Promise<void> {
		status = "stopped";
		owners = new Map();
		nextOffsetByPartition = new Map();
	}

	return { start, stop, findOwner, refresh };
}
