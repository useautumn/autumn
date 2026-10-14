import { isKafkaAccessRefusal } from "@autumn/kafka";
import { isCurrentAllocation } from "../allocation/partitionAllocation.js";
import { requestPartitionServiceStop } from "../partitionService.js";
import type {
	AllocationScope,
	PartitionsScope,
} from "../types/partitionState.js";
import type { PartitionConsumerStatus } from "../types/partitions.js";

export function scheduleConsumerRejoin({
	ctx,
	state,
	allocationGeneration,
	cause,
}: AllocationScope & { cause: unknown }): void {
	const rejoin = state.consumerRejoin;
	rejoin.attempts += 1;
	const { initialBackoffMs, maxBackoffMs } = ctx.config.consumerRejoin;
	const delayMs = Math.min(
		initialBackoffMs * 2 ** (rejoin.attempts - 1),
		maxBackoffMs,
	);
	ctx.logger?.warn(
		{
			event: "balance_worker.consumer_refused",
			error: cause,
			data: { attempt: rejoin.attempts, delayMs },
		},
		`Balance worker refused by the broker; rejoining in ${delayMs}ms (attempt ${rejoin.attempts})`,
	);
	clearConsumerRejoin({ state });
	const timer = setTimeout(runConsumerRejoin, delayMs, {
		ctx,
		state,
		allocationGeneration,
	});
	timer.unref?.();
	rejoin.timer = timer;
}

async function runConsumerRejoin({
	ctx,
	state,
	allocationGeneration,
}: AllocationScope): Promise<void> {
	state.consumerRejoin.timer = null;
	if (!isCurrentAllocation({ state, allocationGeneration })) return;
	try {
		await state.lifecycle;
	} catch {
	}
	if (!isCurrentAllocation({ state, allocationGeneration })) return;
	try {
		await ctx.consumer.restart?.();
	} catch (cause) {
		if (!isCurrentAllocation({ state, allocationGeneration })) return;
		if (isKafkaAccessRefusal({ cause })) {
			scheduleConsumerRejoin({ ctx, state, allocationGeneration, cause });
			return;
		}
		requestPartitionServiceStop({
			ctx,
			state,
			allocationGeneration,
			reason: { cause, scope: "consumer" },
		});
	}
}

export function noteConsumerJoined({ ctx, state }: PartitionsScope): void {
	const rejoin = state.consumerRejoin;
	if (rejoin.attempts === 0) return;
	ctx.logger?.info(
		{
			event: "balance_worker.consumer_rejoined",
			data: { attempts: rejoin.attempts },
		},
		`Balance worker rejoined the group after ${rejoin.attempts} attempts`,
	);
	rejoin.attempts = 0;
}

export function clearConsumerRejoin({
	state,
}: {
	state: PartitionsScope["state"];
}): void {
	const { timer } = state.consumerRejoin;
	if (timer) clearTimeout(timer);
	state.consumerRejoin.timer = null;
}

export function consumerStatusOf({
	state,
}: {
	state: PartitionsScope["state"];
}): PartitionConsumerStatus {
	const { attempts } = state.consumerRejoin;
	return {
		status: attempts > 0 ? "rejoining" : "joined",
		rejoinAttempts: attempts,
	};
}
