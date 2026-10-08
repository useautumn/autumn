import { isKafkaAccessRefusal } from "@autumn/kafka";
import { isCurrentAllocation } from "../allocation/partitionAllocation.js";
import { requestPartitionServiceStop } from "../partitionService.js";
import type {
	AllocationScope,
	PartitionsScope,
} from "../types/partitionState.js";
import type { PartitionConsumerStatus } from "../types/partitions.js";

/**
 * A broker refused this worker's identity and the consumer gave the group up for good. The verdict is the
 * broker's to change, and prod has changed it back within minutes twice, so the worker keeps its
 * task and rejoins with a growing pause instead of exiting: every worker shares one task role, and
 * exiting turned one shared refusal into a fleet with no owner for anything. Between attempts the
 * worker owns nothing and its callers fail open, which is what they did during the exit as well.
 */
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
		// The crashed allocation's partitions release their claims first, so the rejoin never races its own retirement.
		await state.lifecycle;
	} catch {
		// Reported where it failed; the rejoin goes ahead regardless.
	}
	if (!isCurrentAllocation({ state, allocationGeneration })) return;
	try {
		await ctx.consumer.restart?.();
	} catch (cause) {
		if (!isCurrentAllocation({ state, allocationGeneration })) return;
		// Only the broker's refusal is waited out. Any other reason the rejoin fails has nothing to
		// clear on its own, and a worker kept alive owning nothing would leave its callers failing
		// open for good, so the service stops and the task is replaced.
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

/** The group dealt this worker partitions again: whatever refused it has stopped. */
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
