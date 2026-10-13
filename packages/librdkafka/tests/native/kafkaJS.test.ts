import { describe, expect, test } from "bun:test";
import {
	getKafkaJS,
	getLibrdkafkaInfo,
	LIBRDKAFKA_ERROR_CODES,
} from "../../src/librdkafka.js";

describe("the patched native addon under Bun", () => {
	test("loads librdkafka 2.15.0 with the features our clusters need", () => {
		const info = getLibrdkafkaInfo();
		expect(info.version).toBe("2.15.0");
		for (const feature of ["ssl", "sasl_plain", "sasl_scram", "zstd", "gzip"]) {
			expect(info.features).toContain(feature);
		}
	});

	test("builds and tears down every client kind without touching libuv", async () => {
		const { Kafka } = getKafkaJS();
		const kafka = new Kafka({ kafkaJS: { brokers: ["127.0.0.1:1"] } });
		const producer = kafka.producer({ kafkaJS: { idempotent: true } });
		const consumer = kafka.consumer({ kafkaJS: { groupId: "native-probe" } });
		const admin = kafka.admin();
		expect(typeof producer.connect).toBe("function");
		expect(typeof consumer.connect).toBe("function");
		expect(typeof admin.connect).toBe("function");
	});

	test("the error codes we classify on match the library's table", () => {
		const { ErrorCodes } = getKafkaJS();
		for (const [name, code] of Object.entries(LIBRDKAFKA_ERROR_CODES)) {
			expect({ name, code: code as number }).toEqual({
				name,
				code: (ErrorCodes as Record<string, number>)[name] as number,
			});
		}
	});
});
