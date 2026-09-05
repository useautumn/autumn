import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { YAML } from "bun";

const repoRoot = resolve(import.meta.dir, "../..");
const readCompose = (path: string) =>
	YAML.parse(readFileSync(resolve(repoRoot, path), "utf8")) as {
		services: Record<
			string,
			{
				extends: { service: string; file: string };
				ports: string[];
				environment: Record<string, string | number>;
				healthcheck: { timeout: string; retries: number };
			}
		>;
		volumes: Record<string, unknown>;
	};

describe("environment-owned Kafka", () => {
	test("canonical and worktree stacks extend the same broker with environment volumes", () => {
		for (const path of [
			"docker/dev-services.compose.yml",
			"scripts/setup/dw.compose.yml",
		]) {
			const compose = readCompose(path);
			expect(compose.services.kafka.extends.service).toBe("kafka");
			expect(compose.services.kafka.extends.file).toContain(
				"kafka.compose.yml",
			);
			expect(compose.volumes).toHaveProperty("kafka-data");
		}
	});

	test("host and container clients have separate listeners and bounded health checks", () => {
		const kafka = readCompose("docker/kafka.compose.yml").services.kafka;
		expect(kafka.ports).toEqual([`127.0.0.1:\${KAFKA_PORT:-19092}:19092`]);
		expect(kafka.environment.KAFKA_ADVERTISED_LISTENERS).toBe(
			`INTERNAL://kafka:9092,HOST://127.0.0.1:\${KAFKA_PORT:-19092}`,
		);
		expect(kafka.environment.KAFKA_TRANSACTION_STATE_LOG_MIN_ISR).toBe(1);
		expect(kafka.environment.KAFKA_AUTO_CREATE_TOPICS_ENABLE).toBe("false");
		expect(kafka.healthcheck.timeout).toBe("5s");
		expect(kafka.healthcheck.retries).toBe(30);
	});
});
