import { parseKafkaOffset } from "../../../client/kafkaOffsetUtils.js";
import { createTopicConsumer } from "../../../consumer/createTopicConsumer.js";
import type {
	TopicConsumer,
	TopicConsumerConfig,
	TopicRecord,
	TopicRecordResult,
	TopicResumePosition,
} from "../../../consumer/types/consumer.js";
import { parseMeteringRecord } from "../meteringTopic.js";
import { readOwnerHeaders } from "../ownerHeaders.js";
import type {
	MeteringConsumerDependencies,
	MeteringRecordHandler,
} from "./types/meteringConsumer.js";

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

	function readResumeOffset(
		position: TopicResumePosition,
	): bigint | null | Promise<bigint | null> {
		const secondary = secondaryHandlerOf(position);
		if (secondary) return secondary.readResumeOffset(position);
		return ctx.handler.readResumeOffset(position);
	}

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
			if (ctx.handler.shouldApply && !ctx.handler.shouldApply(position))
				return undefined;
			const owner = readOwnerHeaders({ headers: message.headers });
			if (owner.fence) {
				if (owner.ownerEpoch === undefined || !ctx.handler.applyFence)
					return undefined;
				const fenced = ctx.handler.applyFence({
					position,
					ownerEpoch: owner.ownerEpoch,
				});
				return fenced instanceof Promise
					? settleRecordApplication({ ctx, input, application: fenced })
					: fenced;
			}
			const record = parseMeteringRecord({
				key: message.key,
				value: message.value,
			});
			const application = ctx.handler.applyRecord({
				position,
				record,
				ownerEpoch: owner.ownerEpoch,
			});
			return application instanceof Promise
				? settleRecordApplication({ ctx, input, application })
				: application;
		} catch (cause) {
			return settleRecordError({ ctx, input, cause });
		}
	}

	return createTopicConsumer({
		ctx: {
			consumer: ctx.consumer,
			progress: ctx.progress,
			handler: { readResumeOffset, applyRecord },
		},
		config: {
			...config,
			secondaryTopics: Object.keys(ctx.secondaryHandlers ?? {}),
		},
	});
}

async function settleRecordApplication({
	ctx,
	input,
	application,
}: {
	ctx: { handler: MeteringRecordHandler };
	input: TopicRecord;
	application: Promise<TopicRecordResult>;
}): Promise<TopicRecordResult> {
	try {
		return await application;
	} catch (cause) {
		return settleRecordError({ ctx, input, cause });
	}
}

function settleRecordError({
	ctx,
	input,
	cause,
}: {
	ctx: { handler: MeteringRecordHandler };
	input: TopicRecord;
	cause: unknown;
}): TopicRecordResult {
	if (ctx.handler.onRecordError) {
		return ctx.handler.onRecordError({
			topic: input.topic,
			partition: input.partition,
			offset: input.message.offset,
			cause,
		});
	}
	throw cause;
}
