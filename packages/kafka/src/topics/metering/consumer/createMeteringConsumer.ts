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
	function readResumeOffset(
		position: TopicResumePosition,
	): bigint | null | Promise<bigint | null> {
		return ctx.handler.readResumeOffset(position);
	}

	function applyRecord(
		input: TopicRecord,
	): TopicRecordResult | Promise<TopicRecordResult> {
		const { topic, partition, message } = input;
		try {
			const position = {
				topic,
				partition,
				offset: parseKafkaOffset({ offset: message.offset }),
			};
			const record = parseMeteringRecord({
				key: message.key,
				value: message.value,
			});
			const application = ctx.handler.applyRecord({ position, record });
			return application instanceof Promise
				? settleRecordApplication({ ctx, input, application })
				: application;
		} catch (cause) {
			return throwRecordError({ ctx, input, cause });
		}
	}

	return createTopicConsumer({
		ctx: {
			consumer: ctx.consumer,
			progress: ctx.progress,
			handler: { readResumeOffset, applyRecord },
		},
		config,
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
		return throwRecordError({ ctx, input, cause });
	}
}

function throwRecordError({
	ctx,
	input,
	cause,
}: {
	ctx: { handler: MeteringRecordHandler };
	input: TopicRecord;
	cause: unknown;
}): never {
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
