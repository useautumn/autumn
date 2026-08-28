import {
	type Admin,
	type Consumer,
	Kafka,
	logLevel,
	type Producer,
} from "kafkajs";
import {
	type MeteringEvent,
	parseMeteringEvent,
} from "../events/meteringEventSchema.js";
import type { MeteringLog, MeteringLogRecord } from "./meteringLog.js";
import { createMskOauthBearerProvider } from "./mskOauthBearer.js";

const FNV_OFFSET_BASIS = 2_166_136_261;
const FNV_PRIME = 16_777_619;

const partitionKeyOf = ({ event }: { event: MeteringEvent }): string =>
	`${event.org_id}:${event.customer_id}`;

export const partitionForEvent = ({
	event,
	partitionCount,
}: {
	event: MeteringEvent;
	partitionCount: number;
}): number => {
	const key = partitionKeyOf({ event });
	let hash = FNV_OFFSET_BASIS;
	for (let index = 0; index < key.length; index++) {
		hash ^= key.charCodeAt(index);
		hash = Math.imul(hash, FNV_PRIME);
	}
	return (hash >>> 0) % Math.max(1, partitionCount);
};

export class KafkaMeteringLog implements MeteringLog {
	readonly partition: number;
	private readonly topic: string;
	private readonly partitionCount: number;
	private readonly producer: Producer;
	private readonly consumer: Consumer;
	private readonly admin: Admin;
	private buffered: MeteringLogRecord[] = [];

	constructor({
		brokers,
		topic,
		consumerGroup,
		partition = 0,
		partitionCount = 1,
		region = process.env.AWS_REGION ?? "us-east-1",
		clientId = "autumn-metering-worker",
	}: {
		brokers: string[];
		topic: string;
		consumerGroup: string;
		partition?: number;
		partitionCount?: number;
		region?: string;
		clientId?: string;
	}) {
		this.topic = topic;
		this.partition = partition;
		this.partitionCount = partitionCount;

		const kafka = new Kafka({
			clientId,
			brokers,
			ssl: true,
			logLevel: logLevel.WARN,
			sasl: {
				mechanism: "oauthbearer",
				oauthBearerProvider: createMskOauthBearerProvider({ region }),
			},
		});

		this.producer = kafka.producer();
		this.consumer = kafka.consumer({ groupId: consumerGroup });
		this.admin = kafka.admin();
	}

	async connect({ fromOffset }: { fromOffset: number }): Promise<void> {
		await Promise.all([
			this.producer.connect(),
			this.consumer.connect(),
			this.admin.connect(),
		]);
		await this.consumer.subscribe({ topic: this.topic, fromBeginning: true });
		await this.consumer.run({
			eachMessage: async ({ partition, message }) => {
				if (partition !== this.partition || !message.value) return;
				this.buffered.push({
					offset: Number(message.offset),
					event: parseMeteringEvent({
						input: JSON.parse(message.value.toString()),
					}),
				});
			},
		});
		this.seek({ offset: fromOffset });
	}

	async disconnect(): Promise<void> {
		await Promise.all([
			this.producer.disconnect(),
			this.consumer.disconnect(),
			this.admin.disconnect(),
		]);
	}

	async append({ event }: { event: MeteringEvent }): Promise<{
		offset: number;
	}> {
		const [metadata] = await this.producer.send({
			topic: this.topic,
			messages: [
				{
					key: partitionKeyOf({ event }),
					partition: partitionForEvent({
						event,
						partitionCount: this.partitionCount,
					}),
					value: JSON.stringify(event),
				},
			],
		});
		return { offset: Number(metadata?.baseOffset ?? metadata?.offset ?? -1) };
	}

	async getHighWatermark(): Promise<number> {
		const offsets = await this.admin.fetchTopicOffsets(this.topic);
		const owned = offsets.find(({ partition }) => partition === this.partition);
		if (!owned) {
			throw new Error(
				`No high watermark for ${this.topic} partition ${this.partition}`,
			);
		}
		const highWatermark = Number(owned.high);
		if (!Number.isSafeInteger(highWatermark) || highWatermark < 0) {
			throw new Error(
				`Invalid high watermark for ${this.topic} partition ${this.partition}: ${owned.high}`,
			);
		}
		return highWatermark;
	}

	// Records arrive on the consumer's own schedule, so a read that asks for an
	// offset the buffer has already passed rewinds the consumer and returns empty.
	async read({
		fromOffset,
		limit,
	}: {
		fromOffset: number;
		limit: number;
	}): Promise<MeteringLogRecord[]> {
		const head = this.buffered[0];
		if (head && head.offset > fromOffset) {
			this.buffered = [];
			this.seek({ offset: fromOffset });
			return [];
		}

		while (this.buffered.length > 0 && this.buffered[0].offset < fromOffset) {
			this.buffered.shift();
		}

		return this.buffered.splice(0, Math.max(0, limit));
	}

	private seek({ offset }: { offset: number }): void {
		this.consumer.seek({
			topic: this.topic,
			partition: this.partition,
			offset: String(offset),
		});
	}
}
