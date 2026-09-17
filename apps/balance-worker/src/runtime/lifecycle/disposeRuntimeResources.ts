import { OwnedPartitionNotReadyError } from "../runtimeErrors.js";
import type {
	PartitionRuntimeScope,
	PartitionRuntimeState,
} from "../types/partitionRuntimeState.js";

export async function disposeRuntimeResources({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	const cleanupErrors: unknown[] = [];
	try {
		await stopRuntimeFollower({ ctx, state });
	} catch (cause) {
		cleanupErrors.push(cause);
	}
	try {
		await disconnectRuntimeProducer({ ctx, state });
	} catch (cause) {
		cleanupErrors.push(cause);
	}
	if (cleanupErrors.length > 0) {
		throw new AggregateError(
			cleanupErrors,
			`Failed to dispose owned partition ${ctx.config.topic}[${ctx.config.partition}]`,
		);
	}
}

export function stopRuntimeFollower({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	if (!state.followerStartAttempted) return Promise.resolve();
	state.stopFollowerPromise ??= ctx.follower.stop();
	return state.stopFollowerPromise;
}

function disconnectRuntimeProducer({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	if (!state.producerConnectionAttempted) return Promise.resolve();
	state.disconnectProducerPromise ??= ctx.producer.disconnect();
	return state.disconnectProducerPromise;
}

export function cancelRuntimeReaders({
	ctx,
	state,
}: PartitionRuntimeScope): void {
	state.startupAbortController.abort(
		new OwnedPartitionNotReadyError({ status: state.status }),
	);
	if (state.followerStartAttempted)
		void stopFollowerInBackground({ ctx, state });
}

async function stopFollowerInBackground({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	try {
		await stopRuntimeFollower({ ctx, state });
	} catch {
		// The retained stop promise carries cleanup failure to disposal and quiescence.
	}
}

export async function settleRuntimeStartup({
	state,
}: {
	state: PartitionRuntimeState;
}): Promise<void> {
	try {
		await state.startPromise;
	} catch {
		// Startup reports its failure separately; shutdown still has to settle accepted work.
	}
}
