import type {
	Admin,
	KafkaConsumerClient,
	KafkaProducerClient,
} from "@autumn/kafka";
import type {
	PartitionOwnershipPublication,
	Partitions,
} from "../../../src/partitions/types/partitions.js";

type Emit = (event: string, fields?: Record<string, unknown>) => void;
type Describe = (value: unknown) => unknown;
type Ownership = Pick<Partitions, "findRuntime" | "findOwnedRuntime">;
type FollowerProgress = {
	consumedNextOffset: bigint | null;
	highWatermark: bigint | null;
};
type Follower = {
	readProgress(params: { topic: string; partition: number }): FollowerProgress;
};
type TracedRuntime = {
	fence(): Promise<void>;
	getHealth(): { status: string; failureReason: unknown };
};
type Send = NonNullable<KafkaProducerClient["send"]>;
type SendRecord = Parameters<Send>[0];
type PartitionTrace = {
	runtime: TracedRuntime | null;
	follower: Follower | null;
	claimEpoch: string | null;
	claimAt: number | null;
	admittedEpoch: string | null;
	markerOffset: string | null;
	lastStep: string;
	lastStepAt: number;
};

export function createStartupTrace({
	emit,
	describe,
	topic,
	admin,
}: {
	emit: Emit;
	describe: Describe;
	topic: string;
	admin: Pick<Admin, "fetchTopicOffsets">;
}) {
	const state: { ownership: Ownership | null; allocationSeq: number } = {
		ownership: null,
		allocationSeq: 0,
	};
	const traces = new Map<number, PartitionTrace>();
	const paused = new Set<number>();

	function traceOf(partition: number): PartitionTrace {
		const known = traces.get(partition);
		if (known) return known;
		const created: PartitionTrace = {
			runtime: null,
			follower: null,
			claimEpoch: null,
			claimAt: null,
			admittedEpoch: null,
			markerOffset: null,
			lastStep: "none",
			lastStepAt: Date.now(),
		};
		traces.set(partition, created);
		return created;
	}

	function step(
		event: string,
		partition: number,
		fields: Record<string, unknown> = {},
	): void {
		const trace = traceOf(partition);
		trace.lastStep = event;
		trace.lastStepAt = Date.now();
		emit(event, { partition, ...fields });
	}

	function text(value: bigint | string | null | undefined): string | null {
		return value === null || value === undefined ? null : value.toString();
	}

	function progressOf(partition: number): Record<string, unknown> {
		const progress = traceOf(partition).follower?.readProgress({
			topic,
			partition,
		});
		return {
			consumedNextOffset: text(progress?.consumedNextOffset),
			highWatermark: text(progress?.highWatermark),
			paused: paused.has(partition),
		};
	}

	function isAdmittedAt({
		partition,
		routeEpoch,
	}: {
		partition: number;
		routeEpoch: string;
	}): boolean {
		return (
			state.ownership?.findRuntime({ partition, routeEpoch }) !== undefined
		);
	}

	function noteAdmitted({
		partition,
		routeEpoch,
	}: {
		partition: number;
		routeEpoch: string;
	}): void {
		const trace = traceOf(partition);
		if (trace.admittedEpoch === routeEpoch) return;
		trace.admittedEpoch = routeEpoch;
		step("admitted", partition, {
			routeEpoch,
			msSinceClaim: trace.claimAt === null ? null : Date.now() - trace.claimAt,
		});
	}

	function checkAdmission({
		partition,
		after,
	}: {
		partition: number;
		after: string;
	}): void {
		const trace = traceOf(partition);
		const routeEpoch = trace.claimEpoch;
		if (routeEpoch === null) return;
		const admitted = isAdmittedAt({ partition, routeEpoch });
		const health = trace.runtime?.getHealth();
		emit("admit.check", {
			partition,
			after,
			routeEpoch,
			admitted,
			status: health?.status ?? null,
			failureReason: describe(health?.failureReason ?? null),
		});
		if (admitted) noteAdmitted({ partition, routeEpoch });
	}

	function noteClaim({
		partition,
		routeEpoch,
	}: {
		partition: number;
		routeEpoch: string;
	}): void {
		const trace = traceOf(partition);
		trace.claimEpoch = routeEpoch;
		trace.claimAt = Date.now();
	}

	function attach({
		partition,
		runtime,
		follower,
	}: {
		partition: number;
		runtime: TracedRuntime;
		follower: Follower;
	}): void {
		traces.set(partition, {
			runtime,
			follower,
			claimEpoch: null,
			claimAt: null,
			admittedEpoch: null,
			markerOffset: null,
			lastStep: "runtime.created",
			lastStepAt: Date.now(),
		});
	}

	function detach({ partition }: { partition: number }): void {
		const trace = traceOf(partition);
		trace.runtime = null;
		trace.follower = null;
	}

	function bindOwnership(ownership: Ownership): void {
		state.ownership = ownership;
	}

	function noteAllocation(
		event: string,
		fields: Record<string, unknown> = {},
	): void {
		state.allocationSeq += 1;
		emit(event, { allocationSeq: state.allocationSeq, ...fields });
	}

	async function reportFenceWait({
		partition,
		startedAt,
	}: {
		partition: number;
		startedAt: number;
	}): Promise<void> {
		let brokerHigh: string | null = null;
		try {
			const offsets = await admin.fetchTopicOffsets(topic);
			brokerHigh =
				offsets.find((offset) => offset.partition === partition)?.high ?? null;
		} catch (cause) {
			brokerHigh = `unreadable: ${String((cause as Error)?.message ?? cause)}`;
		}
		emit("fence.wait", {
			partition,
			ms: Date.now() - startedAt,
			markerOffset: traceOf(partition).markerOffset,
			brokerHigh,
			...progressOf(partition),
		});
	}

	function traceFence({
		partition,
		runtime,
	}: {
		partition: number;
		runtime: Pick<TracedRuntime, "fence">;
	}): () => Promise<void> {
		async function fence(): Promise<void> {
			const startedAt = Date.now();
			step("fence.start", partition, {
				routeEpoch: traceOf(partition).claimEpoch,
				...progressOf(partition),
			});
			const timer = setInterval(
				() => void reportFenceWait({ partition, startedAt }),
				1_000,
			);
			try {
				await runtime.fence();
				step("fence.done", partition, {
					ms: Date.now() - startedAt,
					markerOffset: traceOf(partition).markerOffset,
					...progressOf(partition),
				});
				setTimeout(() => checkAdmission({ partition, after: "fence" }), 0);
			} catch (cause) {
				step("fence.failed", partition, {
					ms: Date.now() - startedAt,
					error: describe(cause),
				});
				throw cause;
			} finally {
				clearInterval(timer);
			}
		}
		return fence;
	}

	function tracePublication({
		partition,
		publication,
	}: {
		partition: number;
		publication: Pick<
			PartitionOwnershipPublication,
			"awaitClaim" | "awaitRouteClaim"
		>;
	}): Pick<PartitionOwnershipPublication, "awaitClaim" | "awaitRouteClaim"> {
		async function awaitClaim(
			params: Parameters<PartitionOwnershipPublication["awaitClaim"]>[0],
		): Promise<{ routeEpoch: string }> {
			step("handoff_claim.wait", partition, {
				afterReadyAt: params.afterReadyAt ?? null,
			});
			try {
				const claim = await publication.awaitClaim(params);
				noteClaim({ partition, routeEpoch: claim.routeEpoch });
				step("handoff_claim.seen", partition, { routeEpoch: claim.routeEpoch });
				setTimeout(
					() => checkAdmission({ partition, after: "handoff_claim" }),
					0,
				);
				return claim;
			} catch (cause) {
				step("handoff_claim.ended", partition, {
					reason: describe(params.signal.reason ?? cause),
				});
				throw cause;
			}
		}
		async function awaitRouteClaim(
			params: Parameters<PartitionOwnershipPublication["awaitRouteClaim"]>[0],
		): Promise<{ routeEpoch: string }> {
			const claim = await publication.awaitRouteClaim(params);
			emit("route_claim.seen", { partition, routeEpoch: claim.routeEpoch });
			setTimeout(() => {
				const admitted = isAdmittedAt({
					partition,
					routeEpoch: claim.routeEpoch,
				});
				emit("route_claim.admission", {
					partition,
					routeEpoch: claim.routeEpoch,
					admitted,
				});
				if (admitted) noteAdmitted({ partition, routeEpoch: claim.routeEpoch });
			}, 0);
			return claim;
		}
		return { awaitClaim, awaitRouteClaim };
	}

	function isFenceMarker(message: SendRecord["messages"][number]): boolean {
		const value = message.value;
		if (value === null || value === undefined) return false;
		return value.toString().includes('"type":"owner_fence"');
	}

	function baseOffsetOf(metadata: unknown): string | null {
		const first = Array.isArray(metadata) ? metadata[0] : undefined;
		const offset = first?.baseOffset ?? first?.offset;
		return offset === undefined || offset === null ? null : String(offset);
	}

	function traceProducer(producer: KafkaProducerClient): KafkaProducerClient {
		const send = producer.send;
		if (!send) return producer;
		async function tracedSend(record: SendRecord) {
			const marker = record.messages.find(isFenceMarker);
			if (!marker) return send?.call(producer, record);
			const partition = marker.partition ?? -1;
			const startedAt = Date.now();
			step("fence_marker.send", partition, {});
			try {
				const metadata = await send?.call(producer, record);
				const markerOffset = baseOffsetOf(metadata);
				traceOf(partition).markerOffset = markerOffset;
				step("fence_marker.landed", partition, {
					ms: Date.now() - startedAt,
					markerOffset,
					metadata: describe(metadata),
				});
				return metadata;
			} catch (cause) {
				step("fence_marker.failed", partition, {
					ms: Date.now() - startedAt,
					error: describe(cause),
				});
				throw cause;
			}
		}
		return new Proxy(producer, {
			get(target, property, receiver) {
				if (property === "send") return tracedSend;
				const value = Reflect.get(target, property, receiver);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
	}

	function partitionsOf(
		topics: { topic: string; partitions?: number[] }[],
	): number[] {
		return topics
			.filter((entry) => entry.topic === topic)
			.flatMap((entry) => entry.partitions ?? []);
	}

	function traceConsumer(
		consumer: Pick<KafkaConsumerClient, "pause" | "resume" | "seek">,
	): Pick<KafkaConsumerClient, "pause" | "resume" | "seek"> {
		function pause(...args: Parameters<KafkaConsumerClient["pause"]>) {
			const [topics] = args;
			for (const partition of partitionsOf(topics)) paused.add(partition);
			emit("consumer.pause", { topics: describe(topics) });
			return consumer.pause(...args);
		}
		function resume(...args: Parameters<KafkaConsumerClient["resume"]>) {
			const [topics] = args;
			for (const partition of partitionsOf(topics)) paused.delete(partition);
			emit("consumer.resume", { topics: describe(topics) });
			return consumer.resume(...args);
		}
		function seek(...args: Parameters<KafkaConsumerClient["seek"]>) {
			emit("consumer.seek", { target: describe(args[0]) });
			return consumer.seek(...args);
		}
		return { pause, resume, seek };
	}

	function traceOwnership<Owned extends Ownership>(ownership: Owned): Owned {
		function findRuntime(route: Parameters<Ownership["findRuntime"]>[0]) {
			const runtime = ownership.findRuntime(route);
			if (runtime) return runtime;
			const trace = traces.get(route.partition);
			emit("route.not_admitted", {
				partition: route.partition,
				routeEpoch: route.routeEpoch,
				claimEpoch: trace?.claimEpoch ?? null,
				admittedEpoch: trace?.admittedEpoch ?? null,
				owned:
					ownership.findOwnedRuntime({ partition: route.partition }) !==
					undefined,
			});
			return runtime;
		}
		return { ...ownership, findRuntime };
	}

	function watch(): void {
		const now = Date.now();
		for (const [partition, trace] of traces) {
			const routeEpoch = trace.claimEpoch;
			if (!trace.runtime || routeEpoch === null) continue;
			if (trace.admittedEpoch === routeEpoch) continue;
			if (isAdmittedAt({ partition, routeEpoch })) {
				noteAdmitted({ partition, routeEpoch });
				continue;
			}
			const health = trace.runtime.getHealth();
			emit("admission.pending", {
				partition,
				routeEpoch,
				msSinceClaim: trace.claimAt === null ? null : now - trace.claimAt,
				lastStep: trace.lastStep,
				msSinceLastStep: now - trace.lastStepAt,
				status: health.status,
				failureReason: describe(health.failureReason ?? null),
				markerOffset: trace.markerOffset,
				...progressOf(partition),
			});
		}
	}

	function start(): () => void {
		const timer = setInterval(watch, 1_000);
		timer.unref?.();
		return () => clearInterval(timer);
	}

	return {
		step,
		attach,
		detach,
		noteClaim,
		bindOwnership,
		noteAllocation,
		traceFence,
		tracePublication,
		traceProducer,
		traceConsumer,
		traceOwnership,
		checkAdmission,
		start,
	};
}
