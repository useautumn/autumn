import { resolve } from "node:path";

export function ensureBalanceWorkerTopics({
	kafkaPort,
	runtimeEnv,
}: {
	kafkaPort: number;
	runtimeEnv: Record<string, string | undefined>;
}): void {
	const result = Bun.spawnSync(
		[process.execPath, "--config=./bunfig.toml", "scripts/setupLocalTopics.ts"],
		{
			cwd: resolve(import.meta.dir, "../../apps/balance-worker"),
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
	if (result.exitCode !== 0) {
		throw new Error(
			`Balance worker topic setup failed on :${kafkaPort} (exit ${result.exitCode})`,
		);
	}
}
