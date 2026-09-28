import { resolve } from "node:path";
import { readKafkaTestBrokers } from "./kafkaTestEnvironment.ts";

const brokers = readKafkaTestBrokers({
	repoRoot: resolve(import.meta.dir, "../.."),
});
const tests = Bun.spawn(
	[
		"bun",
		"test",
		"--config",
		"./bunfig.toml",
		"--timeout",
		"30000",
		...process.argv.slice(2),
	],
	{
		cwd: process.cwd(),
		env: { ...process.env, KAFKA_BROKERS: brokers },
		stdout: "inherit",
		stderr: "inherit",
	},
);
function interruptTests(): void {
	tests.kill("SIGINT");
}
function terminateTests(): void {
	tests.kill("SIGTERM");
}
process.on("SIGINT", interruptTests);
process.on("SIGTERM", terminateTests);
process.exit(await tests.exited);
