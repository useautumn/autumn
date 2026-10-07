import { parseKafkaOffset } from "../../../client/kafkaOffsetUtils.js";
import { createTopicConsumer } from "../../../consumer/createTopicConsumer.js";
import type {
	TopicConsumer,
	TopicConsumerConfig,
	TopicConsumerHandler,
	TopicRecord,
	TopicRecordResult,
	TopicRecordSlice,
	TopicResumePosition,
} from "../../../consumer/types/consumer.js";
import { parseMeteringRecord } from "../meteringTopic.js";
import { readOwnerHeaders } from "../ownerHeaders.js";
import type {
	MeteringConsumerDependencies,
	MeteringRecordApplication,
	MeteringRecordHandler,
	MeteringRecordsHandler,
	MeteringStaleRecord,
} from "./types/meteringConsumer.js";

function isRecordsHandler(
	handler: MeteringConsumerDependencies["handler"],
): handler is MeteringRecordsHandler {
	return "applyRecords" in handler;
}

export function createMeteringConsumer({
	ctx,
	config,
}: {
	ctx: MeteringConsumerDependencies;
	config: TopicConsumerConfig;
}): TopicConsumer {
	function secondaryHandlerOf({ topic }: { topic: string }) {
		if (topic === config.topic) return undefined;
		const handler = ctx.secondaryHandlers?.[topic];
		if (!handler) throw new Error(`No handler subscribed for topic ${topic}`);
		return handler;
	}

	const fences = new Map<string, MeteringStaleRecord["fence"]>();
	function fenceKeyOf({
		topic,
		partition,
	}: {
		topic: string;
		partition: number;
	}) {
		return `${topic}[${partition}]`;
	}
	function raiseFence({
		position,
		ownerEpoch,
	}: {
		position: MeteringStaleRecord["position"];
		ownerEpoch: bigint;
	}): void {
		const key = fenceKeyOf(position);
		const current = fences.get(key);
		if (current && current.epoch >= ownerEpoch) return;
		fences.set(key, { epoch: ownerEpoch, offset: position.offset });
	}
	function staleFenceOf({
		position,
		ownerEpoch,
	}: {
		position: MeteringStaleRecord["position"];
		ownerEpoch: bigint | undefined;
	}): MeteringStaleRecord["fence"] | null {
		if (ownerEpoch === undefined) return null;
		const fence = fences.get(fenceKeyOf(position));
		if (!fence || position.offset <= fence.offset || ownerEpoch >= fence.epoch)
			return null;
		return fence;
	}

	function readResumeOffset(
		position: TopicResumePosition,
	): bigint | null | Promise<bigint | null> {
		const secondary = secondaryHandlerOf(position);
		if (secondary) return secondary.readResumeOffset(position);
		const { handler } = ctx;
		const keepsOwnFence = !isRecordsHandler(handler) && handler.applyFence;
		if (keepsOwnFence || !handler.readOwnerFence)
			return handler.readResumeOffset(position);
		return seedFenceThenResume({ position, read: handler.readOwnerFence });
	}

	async function seedFenceThenResume({
		position,
		read,
	}: {
		position: TopicResumePosition;
		read: NonNullable<MeteringRecordsHandler["readOwnerFence"]>;
	}): Promise<bigint | null> {
		const stored = await read(position);
		if (stored)
			raiseFence({
				position: { ...position, offset: stored.offset },
				ownerEpoch: stored.epoch,
			});
		return ctx.handler.readResumeOffset(position);
	}

	/** The record path, bound once to its handler so nothing is looked up or wrapped per record. */
	function bindApplyRecord(handler: MeteringRecordHandler) {
		return applyRecord;
		function applyRecord(
			input: TopicRecord,
		): TopicRecordResult | Promise<TopicRecordResult> {
			const { topic, partition, message } = input;
			const secondary = secondaryHandlerOf(input);
			if (secondary) return secondary.applyRecord(input);
			try {
				const position = {
					topic,
					partition,
					offset: parseKafkaOffset({ offset: message.offset }),
				};
				// A record this process wrote is already projected and queued for the store; decoding it again is the cost being avoided.
				if (handler.shouldApply && !handler.shouldApply(position))
					return undefined;
				const owner = readOwnerHeaders({ headers: message.headers });
				if (owner.fence) {
					if (owner.ownerEpoch === undefined) return undefined;
					if (!handler.applyFence) {
						raiseFence({ position, ownerEpoch: owner.ownerEpoch });
						return undefined;
					}
					const fenced = handler.applyFence({
						position,
						ownerEpoch: owner.ownerEpoch,
					});
					return fenced instanceof Promise
						? settleRecordApplication({ handler, input, application: fenced })
						: fenced;
				}
				if (!handler.applyFence) {
					const fence = staleFenceOf({
						position,
						ownerEpoch: owner.ownerEpoch,
					});
					if (fence && owner.ownerEpoch !== undefined) {
						handler.onStaleRecord?.({
							position,
							ownerEpoch: owner.ownerEpoch,
							fence,
						});
						return undefined;
					}
				}
				const record = parseMeteringRecord({
					key: message.key,
					value: message.value,
				});
				const application = handler.applyRecord({
					position,
					record,
					ownerEpoch: owner.ownerEpoch,
				});
				return application instanceof Promise
					? settleRecordApplication({ handler, input, application })
					: application;
			} catch (cause) {
				return settleRecordError({ handler, input, cause });
			}
		}
	}

	/** Decodes a slice for a slice handler: fence markers pass unread, a declined or undecodable record is dropped. */
	function bindApplyRecords(handler: MeteringRecordsHandler) {
		const parseRecord = handler.parseRecord ?? parseMeteringRecord;
		return applyRecords;
		async function applyRecords(slice: TopicRecordSlice): Promise<void> {
			const applications: MeteringRecordApplication[] = [];
			for (const message of slice.messages) {
				const position = {
					topic: slice.topic,
					partition: slice.partition,
					offset: parseKafkaOffset({ offset: message.offset }),
				};
				if (handler.shouldApply && !handler.shouldApply(position)) continue;
				try {
					const owner = readOwnerHeaders({ headers: message.headers });
					if (owner.fence) {
						if (owner.ownerEpoch !== undefined)
							raiseFence({ position, ownerEpoch: owner.ownerEpoch });
						continue;
					}
					const fence = staleFenceOf({
						position,
						ownerEpoch: owner.ownerEpoch,
					});
					if (fence && owner.ownerEpoch !== undefined) {
						handler.onStaleRecord?.({
							position,
							ownerEpoch: owner.ownerEpoch,
							fence,
						});
						continue;
					}
					applications.push({
						position,
						record: parseRecord({
							key: message.key,
							value: message.value,
						}),
						ownerEpoch: owner.ownerEpoch,
					});
				} catch (cause) {
					if (!handler.onRecordError) throw cause;
					handler.onRecordError({
						topic: slice.topic,
						partition: slice.partition,
						offset: message.offset,
						cause,
					});
				}
			}
			await handler.applyRecords({
				topic: slice.topic,
				partition: slice.partition,
				applications,
				heartbeat: slice.heartbeat,
			});
		}
	}

	async function settleBatch(position: {
		topic: string;
		partition: number;
	}): Promise<void> {
		await secondaryHandlerOf(position)?.settleBatch?.(position);
	}

	// The handler kind is decided once here, never per record.
	const handler: TopicConsumerHandler = isRecordsHandler(ctx.handler)
		? { readResumeOffset, applyRecords: bindApplyRecords(ctx.handler) }
		: {
				readResumeOffset,
				applyRecord: bindApplyRecord(ctx.handler),
				settleBatch,
			};

	return createTopicConsumer({
		ctx: { consumer: ctx.consumer, progress: ctx.progress, handler },
		config: {
			...config,
			secondaryTopics: Object.keys(ctx.secondaryHandlers ?? {}),
		},
	});
}

async function settleRecordApplication({
	handler,
	input,
	application,
}: {
	handler: MeteringRecordHandler;
	input: TopicRecord;
	application: Promise<TopicRecordResult>;
}): Promise<TopicRecordResult> {
	try {
		return await application;
	} catch (cause) {
		return settleRecordError({ handler, input, cause });
	}
}

function settleRecordError({
	handler,
	input,
	cause,
}: {
	handler: MeteringRecordHandler;
	input: TopicRecord;
	cause: unknown;
}): TopicRecordResult {
	if (handler.onRecordError) {
		return handler.onRecordError({
			topic: input.topic,
			partition: input.partition,
			offset: input.message.offset,
			cause,
		});
	}
	throw cause;
}
