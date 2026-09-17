import { readTopicHighWatermarks } from "../../../consumer/partitionOffsets.js";
import type {
	OwnershipConsumerContext,
	OwnershipConsumerState,
} from "./types/ownershipConsumer.js";

export async function startOwnershipConsumer({
	ctx,
	state,
}: {
	ctx: OwnershipConsumerContext;
	state: OwnershipConsumerState;
}): Promise<void> {
	try {
		await ctx.admin.connect();
		state.lifetime.signal.throwIfAborted();
		await ctx.topicConsumer.start();
		state.lifetime.signal.throwIfAborted();
		await refreshOwnership({ ctx, state });
		state.lifetime.signal.throwIfAborted();
		state.status = "started";
	} catch (cause) {
		failOwnershipConsumer({ state, cause });
		try {
			await closeOwnershipResources({ ctx, state });
		} catch (cleanupCause) {
			throw new AggregateError(
				[cause, cleanupCause],
				"Ownership startup and cleanup failed",
			);
		}
		throw cause;
	}
}

export async function refreshOwnership({
	ctx,
	state,
}: {
	ctx: OwnershipConsumerContext;
	state: OwnershipConsumerState;
}): Promise<void> {
	const timeout = new AbortController();
	function expire(): void {
		timeout.abort(new Error("Ownership catch-up deadline exceeded"));
	}
	const timer = setTimeout(expire, ctx.catchUpTimeoutMs);
	const signal = AbortSignal.any([state.lifetime.signal, timeout.signal]);
	const interrupted = Promise.withResolvers<never>();
	function abort(): void {
		interrupted.reject(signal.reason);
	}
	signal.addEventListener("abort", abort, { once: true });
	try {
		signal.throwIfAborted();
		await Promise.race([
			catchUpOwnership({ ctx, signal }),
			interrupted.promise,
		]);
	} finally {
		clearTimeout(timer);
		signal.removeEventListener("abort", abort);
		state.refreshing = undefined;
	}
}

async function catchUpOwnership({
	ctx,
	signal,
}: {
	ctx: OwnershipConsumerContext;
	signal: AbortSignal;
}): Promise<void> {
	const targets = await readTopicHighWatermarks({
		ctx: { partitionOffsets: ctx.admin },
		topic: ctx.topic,
	});
	signal.throwIfAborted();
	const pending: Promise<void>[] = [];
	for (const [partition, nextOffset] of targets) {
		if (nextOffset === 0n) continue;
		pending.push(
			ctx.progress.waitUntil({
				topic: ctx.topic,
				partition,
				nextOffset,
				signal,
			}),
		);
	}
	await Promise.all(pending);
	signal.throwIfAborted();
}

export function failOwnershipConsumer({
	state,
	cause,
}: {
	state: OwnershipConsumerState;
	cause: unknown;
}): void {
	if (state.status === "stopped" || state.status === "failed") return;
	state.status = "failed";
	state.lifetime.abort(cause);
}

export async function stopOwnershipConsumer({
	ctx,
	state,
}: {
	ctx: OwnershipConsumerContext;
	state: OwnershipConsumerState;
}): Promise<void> {
	try {
		await Promise.allSettled([state.starting, state.refreshing]);
		await closeOwnershipResources({ ctx, state });
	} finally {
		state.owners.clear();
		state.lastAppliedOffsets.clear();
	}
}

function closeOwnershipResources({
	ctx,
	state,
}: {
	ctx: OwnershipConsumerContext;
	state: OwnershipConsumerState;
}): Promise<void> {
	state.removeCrashListener?.();
	state.removeCrashListener = undefined;
	state.closing ??= disconnectOwnershipResources({ ctx });
	return state.closing;
}

async function disconnectOwnershipResources({
	ctx,
}: {
	ctx: OwnershipConsumerContext;
}): Promise<void> {
	const failures: unknown[] = [];
	try {
		await ctx.topicConsumer.stop();
	} catch (cause) {
		failures.push(cause);
	}
	const results = await Promise.allSettled([
		ctx.consumer.disconnect(),
		ctx.admin.disconnect(),
	]);
	for (const result of results)
		if (result.status === "rejected") failures.push(result.reason);
	if (failures.length > 0)
		throw new AggregateError(failures, "Ownership cleanup failed");
}
