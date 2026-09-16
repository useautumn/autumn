import { createReplayOperatorResourceFactory } from "@server/internal/balances/replay/operator/openReplayOperatorResources.js";
import { describeReplayOperatorError } from "@server/internal/balances/replay/operator/replayOperatorErrors.js";
import type { ReplayArchiveReport } from "@server/internal/balances/replay/operator/runReplayArchive.js";
import {
	type ReplayOperatorResult,
	runReplayOperator,
} from "@server/internal/balances/replay/operator/runReplayOperator.js";
import { parseReplayOperatorArgs } from "./parseReplayOperatorArgs.js";
import {
	buildReplayStagingTargetInput,
	readReplayDatabaseUrl,
	readReplayOperatorJsonFile,
} from "./readReplayOperatorInputs.js";

const usage = `Usage: bun scripts/balance-replay/balance-replay.ts --manifest <file> --target-policy <file> [options]

Options:
  --manifest <file>            Archived replay manifest JSON (required).
  --target-policy <file>       Trusted staging target policy JSON (required).
  --execute                    Run the replay; requires --confirm-frozen-baseline.
  --confirm-frozen-baseline    Confirm the baseline snapshot is frozen.
  --max-requests <n>           1..1000 selected requests (default 1000).
  --requests-per-second <n>    1..10 global pacing (default 10).
  --help                       Show this message.

Environment:
  BALANCE_REPLAY_DATABASE_URL  Dedicated read-only staging connection string.
                               DATABASE_URL is never used as a fallback, and the
                               URL is never printed.

Manifest file shape (JSON):
{
  "baseline": { "id": "replay-baseline-2024-03-01", "capturedAtMs": 1709251200000 },
  "window": { "startMs": 1709251200000, "endMs": 1709251800000 },
  "requests": [
    {
      "id": "observation-1",
      "archivedAtMs": 1709251200000,
      "orgId": "org_123",
      "env": "live",
      "customerId": "cus_123",
      "operation": "track",
      "body": { "customer_id": "cus_123", "feature_id": "messages", "value": 1 }
    },
    {
      "id": "observation-2",
      "archivedAtMs": 1709251200120,
      "orgId": "org_123",
      "env": "live",
      "customerId": "cus_123",
      "operation": "check",
      "body": { "customer_id": "cus_123", "feature_id": "messages", "required_balance": 1 }
    }
  ]
}

Target policy file shape (JSON):
{
  "database": {
    "hostname": "tf-balance-staging-db.internal",
    "port": 5432,
    "database": "balance_staging"
  }
}

Limitations:
  - Dry run by default: counts, limits and the pinned target only. It opens no
    database, Kafka or Redis client and loads no runtime module.
  - The Kafka target is pinned to tf-balance-staging-v2-512 (512 partitions,
    us-east-1, four known brokers) and cannot be redirected from the CLI.
  - The database guard only proves the supplied URL matches the trusted policy
    file. Verify that policy against the staging inventory before executing.
  - Provisional caps: 1000 selected requests, 10 requests/second, 4 customer
    lanes. A larger archive replay needs separate approval.
  - Archive offsets replay as logical time. Durations are client-to-worker
    replay measurements, not production API latency and not a parity benchmark.
  - "live" here is the archived logical environment, not production routing.
`;

const PREVIEW_NOTE =
	"Dry run: nothing was opened or written. Verify the target policy against the staging inventory before running with --execute --confirm-frozen-baseline.";

const EXECUTED_NOTE =
	"Durations are client-to-worker replay timings against the pinned staging deployment; they are not production API latency, and matching values are a point-in-time observation rather than a parity proof.";

function installReplayOperatorSignalHandlers({
	lifetime,
}: {
	lifetime: AbortController;
}): () => void {
	function requestStop(): void {
		lifetime.abort(new Error("replay operator received a stop signal"));
	}
	process.on("SIGINT", requestStop);
	process.on("SIGTERM", requestStop);
	return () => {
		process.off("SIGINT", requestStop);
		process.off("SIGTERM", requestStop);
	};
}

function reportReplayTotals({ report }: { report: ReplayArchiveReport }): void {
	const totals = report.totals;
	console.log(
		`selected=${totals.selected} admitted=${totals.admitted} completed=${totals.completed} refused=${totals.refused} failed=${totals.failed} setupFailed=${totals.setupFailed} executionFailed=${totals.executionFailed}`,
	);
}

function reportReplayOperatorResult({
	result,
}: {
	result: ReplayOperatorResult<ReplayArchiveReport>;
}): void {
	if (result.mode === "preview") {
		console.log(
			JSON.stringify(
				{
					mode: result.mode,
					target: result.target,
					limits: result.limits,
					manifest: result.manifest,
				},
				null,
				2,
			),
		);
		console.log(PREVIEW_NOTE);
		return;
	}
	console.log(
		JSON.stringify({ mode: result.mode, report: result.report }, null, 2),
	);
	reportReplayTotals({ report: result.report });
	console.log(EXECUTED_NOTE);
}

function resolveExitCode({
	result,
}: {
	result: ReplayOperatorResult<ReplayArchiveReport>;
}): number {
	if (result.mode === "preview") return 0;
	return result.report.totals.failed === 0 ? 0 : 1;
}

async function main(): Promise<number> {
	const command = parseReplayOperatorArgs({ args: process.argv.slice(2) });
	if (command.help) {
		console.log(usage);
		return 0;
	}
	const databaseUrl = readReplayDatabaseUrl({ runtimeEnv: process.env });
	const manifestInput = await readReplayOperatorJsonFile({
		path: command.manifestPath,
		label: "manifest",
	});
	const policyInput = await readReplayOperatorJsonFile({
		path: command.policyPath,
		label: "target policy",
	});
	const lifetime = new AbortController();
	const removeSignalHandlers = installReplayOperatorSignalHandlers({
		lifetime,
	});
	try {
		const result = await runReplayOperator({
			manifestInput,
			targetInput: buildReplayStagingTargetInput({ databaseUrl }),
			policyInput,
			options: {
				execute: command.execute,
				confirmFrozenBaseline: command.confirmFrozenBaseline,
				maxRequests: command.maxRequests,
				requestsPerSecond: command.requestsPerSecond,
			},
			openResources: createReplayOperatorResourceFactory({ databaseUrl }),
			signal: lifetime.signal,
		});
		reportReplayOperatorResult({ result });
		return resolveExitCode({ result });
	} finally {
		removeSignalHandlers();
	}
}

if (import.meta.main) {
	try {
		process.exit(await main());
	} catch (error) {
		console.error(
			JSON.stringify({
				event: "replay_operator_failed",
				error: describeReplayOperatorError({ error }),
			}),
		);
		process.exit(1);
	}
}
