import type * as Confluent from "@confluentinc/kafka-javascript";
import { CONFLUENT_PACKAGE } from "../native/nativePackage.js";

/** The KafkaJS-compatible API of @confluentinc/kafka-javascript (librdkafka underneath). */
export type ConfluentKafkaJS = typeof Confluent.KafkaJS;

/** librdkafka's own consumer, without the KafkaJS shim on top. */
export type NativeKafkaConsumerClass = typeof Confluent.KafkaConsumer;

export type LibrdkafkaInfo = { version: string; features: string[] };

let loaded: typeof Confluent | undefined;

/** Loads the addon on first use: importing this package must never need a native build. */
function loadConfluent(): typeof Confluent {
	if (loaded) return loaded;
	try {
		loaded = require(CONFLUENT_PACKAGE) as typeof Confluent;
	} catch (cause) {
		throw new Error(
			"The librdkafka addon is not built for this machine. Run `bun run --cwd packages/librdkafka build`.",
			{ cause },
		);
	}
	return loaded;
}

export function getKafkaJS(): ConfluentKafkaJS {
	return loadConfluent().KafkaJS;
}

export function getNativeKafkaConsumer(): NativeKafkaConsumerClass {
	return loadConfluent().KafkaConsumer;
}

export function getLibrdkafkaInfo(): LibrdkafkaInfo {
	const confluent = loadConfluent();
	return {
		version: confluent.librdkafkaVersion,
		features: [...confluent.features],
	};
}
