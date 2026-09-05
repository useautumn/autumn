import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function resolveKafkaTestBrokers({
	runtimeEnv,
	worktreeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
	worktreeEnv: string | undefined;
}): string {
	const configured =
		runtimeEnv.KAFKA_BROKERS ??
		worktreeEnv?.match(/^KAFKA_BROKERS=(.*)$/m)?.[1];
	if (!configured?.trim()) {
		throw new Error(
			"Kafka integration tests require KAFKA_BROKERS. Reuse the broker from bun dw setup (server/.env.local), or run bun dev:services up and set KAFKA_BROKERS=127.0.0.1:19092. Tests never start services.",
		);
	}
	const brokers: string[] = [];
	for (const value of configured.split(",")) {
		const broker = value.trim();
		if (!broker) {
			throw new Error("KAFKA_BROKERS must contain non-empty broker addresses");
		}
		brokers.push(broker);
	}
	return brokers.join(",");
}

export function readKafkaTestBrokers({
	repoRoot,
}: {
	repoRoot: string;
}): string {
	const envPath = join(repoRoot, "server/.env.local");
	return resolveKafkaTestBrokers({
		runtimeEnv: process.env,
		worktreeEnv: existsSync(envPath)
			? readFileSync(envPath, "utf8")
			: undefined,
	});
}
