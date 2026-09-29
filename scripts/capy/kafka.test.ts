import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "../..");
const prefix = mkdtempSync(join(tmpdir(), "capy-kafka-"));
const port = 29092;

function inCapyKafka({ command }: { command: string }) {
	return Bun.spawnSync(
		["bash", "-c", `. scripts/setup/capy-kafka.sh && ${command}`],
		{
			cwd: repoRoot,
			env: {
				...process.env,
				CAPY_PREFIX: prefix,
				CAPY_KAFKA_PORT: String(port),
				CAPY_KAFKA_CONTROLLER_PORT: String(port + 1),
			},
			stderr: "inherit",
		},
	);
}

const startCapyKafka = () =>
	inCapyKafka({ command: "start_capy_kafka" }).exitCode;

const topics = ({ args }: { args: string }) =>
	inCapyKafka({
		command: `"$CAPY_KAFKA_HOME/bin/kafka-topics.sh" --bootstrap-server 127.0.0.1:${port} ${args}`,
	});

const brokerPid = () =>
	Number(readFileSync(join(prefix, "kafka", "kafka.pid"), "utf-8"));

afterAll(() => {
	try {
		process.kill(brokerPid(), "SIGKILL");
	} catch {}
	rmSync(prefix, { recursive: true, force: true });
});

describe("start_capy_kafka", () => {
	test("leaves a plaintext broker serving the admin API", () => {
		expect(startCapyKafka()).toBe(0);
		const created = topics({
			args: "--create --topic capy-kafka-test --partitions 2",
		});
		expect(created.exitCode).toBe(0);
		expect(topics({ args: "--list" }).stdout.toString()).toContain(
			"capy-kafka-test",
		);
	}, 60_000);

	test("a second start reuses the running broker", () => {
		const pid = brokerPid();
		expect(startCapyKafka()).toBe(0);
		expect(brokerPid()).toBe(pid);
	}, 60_000);
});
