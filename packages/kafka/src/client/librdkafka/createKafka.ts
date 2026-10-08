import {
	getKafkaJS,
	getNativeKafkaConsumer,
	type KafkaJS,
} from "@autumn/librdkafka";
import type { KafkaClientConfig } from "../types/kafkaClient.js";
import type {
	Admin,
	Consumer,
	ConsumerConfig,
	Kafka,
	Producer,
	ProducerConfig,
} from "../types/kafkaWire.js";
import { createLibrdkafkaAdmin } from "./admin/createLibrdkafkaAdmin.js";
import { createLibrdkafkaConsumer } from "./consumer/createLibrdkafkaConsumer.js";
import type {
	NativeConsumer,
	NativeConsumerFactory,
} from "./consumer/types/nativeConsumer.js";
import { createKafkaLog } from "./kafkaLog.js";
import { nativeClientConfigOf } from "./nativeClientConfig.js";
import { createLibrdkafkaProducer } from "./producer/createLibrdkafkaProducer.js";

function createNativeConsumer({
	global,
	topic,
}: Parameters<NativeConsumerFactory>[0]): NativeConsumer {
	const KafkaConsumer = getNativeKafkaConsumer();
	return new KafkaConsumer(
		global as never,
		topic as never,
	) as unknown as NativeConsumer;
}

/** A Kafka client on librdkafka. Nothing native loads until the first producer, consumer or admin. */
export function createKafka(config: KafkaClientConfig): Kafka {
	const nativeClientConfig = nativeClientConfigOf({ config });
	const log = createKafkaLog({
		clientId: config.clientId,
		sink: config.logSink,
	});
	const defaults = {
		requestTimeout: config.requestTimeout,
		retry: config.retry,
	};
	let kafkaJS: KafkaJS.Kafka | undefined;

	function shim(): KafkaJS.Kafka {
		kafkaJS ??= new (getKafkaJS().Kafka)({});
		return kafkaJS;
	}

	function producer(producerConfig: ProducerConfig = {}): Producer {
		return createLibrdkafkaProducer({
			ctx: { kafka: shim(), nativeClientConfig, defaults, log },
			config: producerConfig,
		});
	}

	function consumer(consumerConfig: ConsumerConfig): Consumer {
		return createLibrdkafkaConsumer({
			ctx: { createNative: createNativeConsumer, nativeClientConfig, log },
			config: consumerConfig,
		});
	}

	function admin(): Admin {
		return createLibrdkafkaAdmin({
			ctx: {
				kafka: shim(),
				nativeClientConfig,
				createNative: createNativeConsumer,
				log,
			},
		});
	}

	return { producer, consumer, admin };
}
