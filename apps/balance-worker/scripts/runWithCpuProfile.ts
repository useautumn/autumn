// Starts the balance worker, under Bun's CPU profiler when
// BALANCE_WORKER_CPU_PROFILE=1. The profile is only written when the process
// exits, and a container's disk goes with it, so on exit the launcher uploads
// whatever the profiler wrote to the checkpoint bucket before returning.
import { readdirSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { initInfisical } from "@autumn/shared/utils/infisical";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const PROFILE_DIR = "/tmp/balance-worker-cpu-profile";

await initInfisical();
const profiling = process.env.BALANCE_WORKER_CPU_PROFILE === "1";

const child = Bun.spawn(
	[
		process.execPath,
		"--config=./bunfig.toml",
		...(profiling
			? ["--cpu-prof", "--cpu-prof-md", `--cpu-prof-dir=${PROFILE_DIR}`]
			: []),
		"src/main.ts",
	],
	{ stdio: ["inherit", "inherit", "inherit"], env: process.env },
);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
	process.on(signal, () => child.kill(signal));
}

const exitCode = await child.exited;
if (profiling) await uploadProfiles();
process.exit(exitCode);

async function uploadProfiles(): Promise<void> {
	try {
		const bucket =
			process.env.BALANCE_WORKER_CHECKPOINT_BUCKET ??
			"tf-balance-worker-staging-snapshots-001092881874-us-east-1";
		const deployment = process.env.BALANCE_WORKER_DEPLOYMENT ?? "unknown";
		const prefix = `balance-checkpoints/${deployment}/cpu-profiles/${new Date().toISOString()}-${hostname()}`;
		const client = new S3Client({
			region: process.env.BALANCE_WORKER_CHECKPOINT_REGION ?? "us-east-1",
		});
		for (const file of readdirSync(PROFILE_DIR)) {
			await client.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: `${prefix}/${file}`,
					Body: readFileSync(join(PROFILE_DIR, file)),
				}),
			);
			console.log(`cpu profile uploaded: s3://${bucket}/${prefix}/${file}`);
		}
	} catch (cause) {
		// A failed upload must not change how the worker exited.
		console.error("cpu profile upload failed", cause);
	}
}
