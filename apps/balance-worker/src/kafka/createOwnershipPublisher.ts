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
			tail: Pick<OwnershipTail, "tailPartition" | "readView">;
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

	async function announcePreparing(): Promise<void> {
		if (!ctx.handoff) return;
		await publisher.announcePreparing({
			partition: config.partition,
			endpoint: config.endpoint,
			preparingAt: Date.now(),
		});
	}

	async function announceDraining({
		successor,
	}: {
		successor: string;
	}): Promise<void> {
		if (!ctx.handoff) return;
		await publisher.announceDraining({
			partition: config.partition,
			endpoint: config.endpoint,
			successor,
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

	/** A drain the current owner started and has not yet concluded: whoever it names, fencing it now would cut it short. */
	function readActiveDrain(): { endpoint: string } | null {
		const view = ctx.handoff?.tail.readView({ partition: config.partition });
		const drain = view?.activeDrain;
		if (!drain || drain.endpoint === config.endpoint) return null;
		return { endpoint: drain.endpoint };
	}

	/** A preparation another worker announced and has not concluded: a successor is on its way. */
	function readActivePreparation(): { endpoint: string } | null {
		const view = ctx.handoff?.tail.readView({ partition: config.partition });
		const preparation = view?.activePreparation;
		if (!preparation || preparation.endpoint === config.endpoint) return null;
		return { endpoint: preparation.endpoint };
	}

	function awaitPreparing({
		signal,
	}: {
		signal: AbortSignal;
	}): Promise<{ endpoint: string }> {
		function matchPreparing({ record }: OwnershipTailRecord) {
			if (record.type !== "preparing" || record.endpoint === config.endpoint)
				return undefined;
			return { endpoint: record.endpoint };
		}
		return awaitRecord({ signal, match: matchPreparing });
	}

	function awaitDraining({
		signal,
	}: {
		signal: AbortSignal;
	}): Promise<{ endpoint: string }> {
		// A drain handing to this worker is always ours to wait on. One naming another
		// successor still means the owner is alive mid-drain, unless its author no longer
		// owns the partition, in which case it is a late record and nothing to hold for.
		function matchDraining({ record }: OwnershipTailRecord) {
			if (record.type !== "draining" || record.endpoint === config.endpoint)
				return undefined;
			if (record.successor === config.endpoint)
				return { endpoint: record.endpoint };
			const owner = ctx.handoff?.tail.readView({
				partition: config.partition,
			})?.owner;
			if (owner !== undefined && owner !== record.endpoint) return undefined;
			return { endpoint: record.endpoint };
		}
		return awaitRecord({ signal, match: matchDraining });
	}

	/** A `claimed` naming some other worker: the owner concluded a handoff that was not to this worker. */
	function awaitForeignClaim({
		signal,
	}: {
		signal: AbortSignal;
	}): Promise<{ endpoint: string }> {
		function matchForeignClaim({ record }: OwnershipTailRecord) {
			if (record.type !== "claimed" || record.endpoint === config.endpoint)
				return undefined;
			return { endpoint: record.endpoint };
		}
		return awaitRecord({ signal, match: matchForeignClaim });
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
		announcePreparing,
		announceDraining,
		awaitReady,
		readActiveDrain,
		readActivePreparation,
		awaitPreparing,
		awaitDraining,
		awaitForeignClaim,
		awaitClaim,
	};
}
