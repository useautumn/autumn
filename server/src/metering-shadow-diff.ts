import "dotenv/config";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { printSummary } from "./internal/metering/loadtest/summary.js";
import {
	parseShadowDiffPairs,
	runShadowDiff,
	type ShadowDiffSummary,
	waitForWorkerCatchUp,
} from "./internal/metering/shadowDiff/runShadowDiff.js";

const DEFAULT_CONCURRENCY = 8;

const requireEnv = ({ name }: { name: string }): string => {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required env var ${name}`);
	return value;
};

const uploadReport = async ({
	summary,
	key,
}: {
	summary: ShadowDiffSummary;
	key: string;
}): Promise<void> => {
	const bucket = requireEnv({ name: "SNAPSHOT_BUCKET" });
	const client = new S3Client({
		region: process.env.AWS_REGION ?? "us-east-1",
	});
	await client.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: JSON.stringify(summary),
			ContentType: "application/json",
		}),
	);
};

export const main = async (): Promise<void> => {
	const concurrency = Math.max(
		1,
		Number(process.env.LT_CONCURRENCY ?? DEFAULT_CONCURRENCY),
	);
	const workerUrl = requireEnv({ name: "LT_WORKER_URL" });
	await waitForWorkerCatchUp({ workerUrl });
	const summary = await runShadowDiff({
		pairs: parseShadowDiffPairs({
			raw: requireEnv({ name: "LT_PAIRS_JSON" }),
		}),
		workerUrl,
		apiBase: requireEnv({ name: "LT_API_BASE" }),
		apiKey: requireEnv({ name: "LT_API_KEY" }),
		concurrency,
	});

	printSummary({ summary });
	const reportKey = process.env.LT_REPORT_S3_KEY;
	if (reportKey) await uploadReport({ summary, key: reportKey });

	if (
		summary.mismatch > 0 ||
		summary.worker_missing > 0 ||
		summary.api_missing > 0 ||
		summary.unreachable > 0
	) {
		process.exitCode = 1;
	}
};

if (import.meta.main) await main();
