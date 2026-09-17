import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { YAML } from "bun";
import { ensureComposeStack } from "../dw/helpers/compose.ts";
import { ensureBalanceWorkerTopics } from "./ensureBalanceWorkerTopics.ts";

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

const successfulProcess = {
	exitCode: 0,
	stdout: Buffer.alloc(0),
	stderr: Buffer.alloc(0),
} as ReturnType<typeof Bun.spawnSync>;

function provisionsTopicsOnTheEnvironmentBroker(): void {
	const runtimeEnv = {
		KAFKA_BROKERS: "remote.example:9092",
		BALANCE_WORKER_DEPLOYMENT: "production",
		BALANCE_WORKER_METERING_TOPIC: "custom.metering",
		BALANCE_WORKER_OWNERSHIP_TOPIC: "custom.ownership",
		BALANCE_WORKER_PARTITION_COUNT: "12",
	};
	const spawn = spyOn(Bun, "spawnSync").mockReturnValue(successfulProcess);
	try {
		for (const kafkaPort of [19092, 24092]) {
			ensureBalanceWorkerTopics({ kafkaPort, runtimeEnv });
			expect(spawn).toHaveBeenLastCalledWith(
				[
					process.execPath,
					"--config=./bunfig.toml",
					"scripts/setupLocalTopics.ts",
				],
				{
					cwd: resolve(repoRoot, "apps/balance-worker"),
					env: {
						...runtimeEnv,
						KAFKA_BROKERS: `127.0.0.1:${kafkaPort}`,
						BALANCE_WORKER_DEPLOYMENT: "local",
					},
					stdout: "inherit",
					stderr: "inherit",
					timeout: 60_000,
				},
			);
		}
		expect(runtimeEnv.KAFKA_BROKERS).toBe("remote.example:9092");
		expect(runtimeEnv.BALANCE_WORKER_DEPLOYMENT).toBe("production");
	} finally {
		spawn.mockRestore();
	}
}

function provisionFailingTopics(): void {
	ensureBalanceWorkerTopics({ kafkaPort: 19092, runtimeEnv: {} });
}

function surfacesTopicSetupFailure(): void {
	const spawn = spyOn(Bun, "spawnSync").mockReturnValue({
		...successfulProcess,
		exitCode: 1,
	});
	try {
		expect(provisionFailingTopics).toThrow(
			"Balance worker topic setup failed on :19092 (exit 1)",
		);
	} finally {
		spawn.mockRestore();
	}
}

function startWorktreeStack(): void {
	ensureComposeStack(1, undefined);
}

function provisionsWorktreeTopicsAfterBrokerReadiness(): void {
	const spawn = spyOn(Bun, "spawnSync").mockReturnValue(successfulProcess);
	try {
		startWorktreeStack();
		expect(spawn).toHaveBeenCalledTimes(3);
		expect(spawn).toHaveBeenNthCalledWith(
			2,
			[
				"docker",
				"compose",
				"-f",
				resolve(repoRoot, "scripts/setup/dw.compose.yml"),
				"-p",
				"autumn-wt-1",
				"up",
				"-d",
				"--wait",
				"--wait-timeout",
				"90",
			],
			expect.objectContaining({
				env: expect.objectContaining({ KAFKA_PORT: "24092" }),
			}),
		);
		expect(spawn).toHaveBeenNthCalledWith(
			3,
			[
				process.execPath,
				"--config=./bunfig.toml",
				"scripts/setupLocalTopics.ts",
			],
			expect.objectContaining({
				env: expect.objectContaining({ KAFKA_BROKERS: "127.0.0.1:24092" }),
			}),
		);
	} finally {
		spawn.mockRestore();
	}
}

function doesNotProvisionTopicsWhenTheBrokerIsUnhealthy(): void {
	const spawn = spyOn(Bun, "spawnSync")
		.mockReturnValue(successfulProcess)
		.mockReturnValueOnce(successfulProcess)
		.mockReturnValueOnce({
			...successfulProcess,
			exitCode: 1,
			stderr: Buffer.from("broker not healthy"),
		});
	try {
		expect(startWorktreeStack).toThrow(
			"Failed to start compose stack autumn-wt-1: broker not healthy",
		);
		expect(spawn).toHaveBeenCalledTimes(2);
	} finally {
		spawn.mockRestore();
	}
}

function workerScriptFlagsExecuteTheEntrypoint(): void {
	const workerDirectory = resolve(repoRoot, "apps/balance-worker");
	const { scripts } = JSON.parse(
		readFileSync(resolve(workerDirectory, "package.json"), "utf8"),
	) as { scripts: Record<string, string> };
	for (const scriptName of ["start", "setup:local"]) {
		const command = scripts[scriptName].split(" ");
		expect(command.shift()).toBe("bun");
		command.pop();
		const result = Bun.spawnSync(
			[
				process.execPath,
				...command,
				"--eval",
				'console.log("balance-worker-script-ok")',
			],
			{
				cwd: workerDirectory,
				stdout: "pipe",
				stderr: "pipe",
				timeout: 5_000,
			},
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString().trim()).toBe("balance-worker-script-ok");
	}
}

test(
	"topic setup overrides inherited brokers and preserves topic configuration",
	provisionsTopicsOnTheEnvironmentBroker,
);
test("topic setup surfaces a failed subprocess", surfacesTopicSetupFailure);
test(
	"worktree startup provisions topics after broker readiness",
	provisionsWorktreeTopicsAfterBrokerReadiness,
);
test(
	"worktree startup stops before topic setup when the broker is unhealthy",
	doesNotProvisionTopicsWhenTheBrokerIsUnhealthy,
);
test(
	"worker package script flags execute their entrypoints",
	workerScriptFlagsExecuteTheEntrypoint,
);
