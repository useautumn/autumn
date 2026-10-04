import type { AutumnLogger } from "@autumn/logging";
import type { OwnedPartitionHealth } from "../health/ownedPartitionHealth.js";
import type { BalanceWorkerState } from "../init/types/balanceWorkerState.js";
import type { PartitionConsumerStatus } from "../partitions/types/partitions.js";
import { partitionHealthLogFields } from "./partitionHealthLogFields.js";
import type { ProcessStatsWindow } from "./processStats/createProcessStats.js";

const HEALTH_REPORT_INTERVAL_MS = 10_000;

type WorkerHealthReporterContext = {
	logger: Pick<AutumnLogger, "info" | "warn">;
	readPartitions(): OwnedPartitionHealth[];
	readWorkerStatus(): BalanceWorkerState["status"];
	readConsumer?(): PartitionConsumerStatus;
	/** Where the process's CPU went since the last report; absent, reports carry no `process` block. */
	readProcess?(): ProcessStatsWindow;
	schedule?: (params: { intervalMs: number; run(): void }) => () => void;
};

export function createWorkerHealthReporter({
	ctx,
	config,
}: {
	ctx: WorkerHealthReporterContext;
	config: { deployment: string; enabled: boolean; endpoint: string };
}): { start(): void; stop(): void } {
	const identity = {
		workerEndpoint: config.endpoint,
		workerInstanceId: crypto.randomUUID(),
	};
	let status: "created" | "active" | "stopped" = "created";
	let cancel: (() => void) | undefined;

	function report(): void {
		if (status !== "active") return;
		try {
			const health = ctx.readPartitions();
			const metadata = {
				workerDeployment: config.deployment,
				workerStatus: ctx.readWorkerStatus(),
			};
			const reportedAt = new Date().toISOString();
			// One window per report, repeated on each partition line so a partition query sees its task's split.
			const processStats = ctx.readProcess
				? { process: ctx.readProcess() }
				: {};
			const partitionStatusCounts: Record<string, number> = {};
			for (const partition of health) {
				partitionStatusCounts[partition.status] =
					(partitionStatusCounts[partition.status] ?? 0) + 1;
			}
			ctx.logger.info(
				{
					event: "balance_worker.health",
					...metadata,
					data: {
						...identity,
						reportedAt,
						reportedPartitions: health.length,
						partitionStatusCounts,
						consumer: ctx.readConsumer?.() ?? null,
						...processStats,
					},
				},
				"Balance worker health",
			);
			for (const partition of health) {
				const {
					topic,
					partition: number,
					status,
					failureReason,
					...rest
				} = partitionHealthLogFields({ health: partition });
				ctx.logger.info(
					{
						event: "balance_worker.partition_health",
						...metadata,
						topic,
						partition: number,
						status,
						failureReason,
						data: { ...identity, reportedAt, ...rest, ...processStats },
					},
					"Balance worker partition health",
				);
			}
		} catch (cause) {
			try {
				ctx.logger.warn(
					{
						event: "balance_worker.health_error",
						workerDeployment: config.deployment,
						error: cause,
						data: identity,
					},
					"Balance worker health report unavailable",
				);
			} catch {
				// Telemetry failure must not enter the partition recovery path.
			}
		}
	}

	function start(): void {
		if (status !== "created") return;
		if (!config.enabled) {
			status = "stopped";
			return;
		}
		status = "active";
		cancel = (ctx.schedule ?? scheduleReports)({
			intervalMs: HEALTH_REPORT_INTERVAL_MS,
			run: report,
		});
		report();
	}

	function stop(): void {
		if (status === "stopped") return;
		status = "stopped";
		cancel?.();
	}

	return { start, stop };
}

function scheduleReports({
	intervalMs,
	run,
}: {
	intervalMs: number;
	run(): void;
}): () => void {
	const timer = setInterval(run, intervalMs);
	timer.unref();
	function cancel(): void {
		clearInterval(timer);
	}
	return cancel;
}
