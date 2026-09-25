import {
	createOwnershipPublisher as createKafkaOwnershipPublisher,
	type KafkaProducerSession,
	type KafkaSender,
	type OwnershipTail,
	type OwnershipTailRecord,
} from "@autumn/kafka";
import type { Admin } from "kafkajs";
import type { PartitionOwnershipPublication } from "../partitions/types/partitions.js";

export function createOwnershipPublisher({
	ctx,
	config,
}: {
	ctx: {
		session: KafkaProducerSession;
		partitionOffsets: Pick<Admin, "fetchTopicOffsets">;
		/** Without these nothing is announced and no wait settles: handoffs time out into release-then-claim. */
		handoff?: {
			tail: Pick<OwnershipTail, "tailPartition">;
			sender: KafkaSender;
		};
	};
	config: { topic: string; partition: number; endpoint: string };
}): PartitionOwnershipPublication {
	const publisher = createKafkaOwnershipPublisher({
		ctx: { producer: ctx.session, sender: ctx.handoff?.sender },
		config: { topic: config.topic },
	});

	async function claim({
		endpoint = config.endpoint,
	}: {
		endpoint?: string;
	} = {}): Promise<{ routeEpoch: string }> {
		const offsets = await ctx.partitionOffsets.fetchTopicOffsets(config.topic);
		let partitionExists = false;
		for (const { partition } of offsets) {
			if (partition === config.partition) {
				partitionExists = true;
				break;
			}
		}
		if (!partitionExists) {
			throw new Error(
				`Ownership topic ${config.topic} must contain metering partition ${config.partition}`,
			);
		}
		if (!ctx.session.isUsable()) {
			throw new Error(
				"Ownership claim requires an initialized producer session",
			);
		}
		return publisher.claim({
			partition: config.partition,
			endpoint,
			claimedAt: Date.now(),
		});
	}

	async function release(): Promise<void> {
		if (!ctx.session.isUsable()) return;
		await publisher.release({
			partition: config.partition,
			releasedAt: Date.now(),
			endpoint: config.endpoint,
		});
	}

	async function announceReady(): Promise<void> {
		if (!ctx.handoff) return;
		await publisher.announceReady({
			partition: config.partition,
			endpoint: config.endpoint,
			readyAt: Date.now(),
		});
	}

	async function announceDraining(): Promise<void> {
		if (!ctx.handoff) return;
		await publisher.announceDraining({
			partition: config.partition,
			endpoint: config.endpoint,
			drainingAt: Date.now(),
		});
	}

	/** Resolves on the first tail record `match` accepts; rejects with the signal's reason. */
	function awaitRecord<Result>({
		signal,
		match,
	}: {
		signal: AbortSignal;
		match(entry: OwnershipTailRecord): Result | undefined;
	}): Promise<Result> {
		const { promise, resolve, reject } = Promise.withResolvers<Result>();
		const done = new AbortController();
		function onAbort(): void {
			done.abort();
			reject(signal.reason);
		}
		function onRecord(entry: OwnershipTailRecord): void {
			const result = match(entry);
			if (result === undefined) return;
			signal.removeEventListener("abort", onAbort);
			done.abort();
			resolve(result);
		}
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
		else
			ctx.handoff?.tail.tailPartition({
				partition: config.partition,
				onRecord,
				signal: done.signal,
			});
		return promise;
	}

	function awaitReady({
		signal,
	}: {
		signal: AbortSignal;
	}): Promise<{ endpoint: string }> {
		function matchReady({ record }: OwnershipTailRecord) {
			if (record.type !== "ready" || record.endpoint === config.endpoint)
				return undefined;
			return { endpoint: record.endpoint };
		}
		return awaitRecord({ signal, match: matchReady });
	}

	function awaitDraining({
		signal,
	}: {
		signal: AbortSignal;
	}): Promise<{ endpoint: string }> {
		function matchDraining({ record }: OwnershipTailRecord) {
			if (record.type !== "draining" || record.endpoint === config.endpoint)
				return undefined;
			return { endpoint: record.endpoint };
		}
		return awaitRecord({ signal, match: matchDraining });
	}

	function awaitClaim({
		signal,
	}: {
		signal: AbortSignal;
	}): Promise<{ routeEpoch: string }> {
		function matchClaim({ record, offset }: OwnershipTailRecord) {
			if (record.type !== "claimed" || record.endpoint !== config.endpoint)
				return undefined;
			return { routeEpoch: offset.toString() };
		}
		return awaitRecord({ signal, match: matchClaim });
	}

	return {
		claim,
		release,
		announceReady,
		announceDraining,
		awaitReady,
		awaitDraining,
		awaitClaim,
	};
}
