import type { AutumnLogger } from "@autumn/logging";
import type { OwnedPartitionHealth } from "../health/ownedPartitionHealth.js";
import type { BalanceWorkerState } from "../init/types/balanceWorkerState.js";
import { partitionHealthLogFields } from "./partitionHealthLogFields.js";

const HEALTH_REPORT_INTERVAL_MS = 10_000;

type WorkerHealthReporterContext = {
	logger: Pick<AutumnLogger, "info" | "warn">;
	readPartitions(): OwnedPartitionHealth[];
	readWorkerStatus(): BalanceWorkerState["status"];
	schedule?: (params: { intervalMs: number; run(): void }) => () => void;
};

export function createWorkerHealthReporter({
	ctx,
	config,
}: {
	ctx: WorkerHealthReporterContext;
	config: { deployment: string; endpoint: string };
}): { start(): void; stop(): void } {
	const identity = {
		workerDeployment: config.deployment,
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
				...identity,
				workerStatus: ctx.readWorkerStatus(),
				reportedAt: new Date().toISOString(),
			};
			const partitionStatusCounts: Record<string, number> = {};
			for (const partition of health) {
				partitionStatusCounts[partition.status] =
					(partitionStatusCounts[partition.status] ?? 0) + 1;
			}
			ctx.logger.info(
				{
					...metadata,
					event: "balance_worker.health",
					reportedPartitions: health.length,
					partitionStatusCounts,
				},
				"Balance worker health",
			);
			for (const partition of health) {
				ctx.logger.info(
					{
						...metadata,
						event: "balance_worker.partition_health",
						...partitionHealthLogFields({ health: partition }),
					},
					"Balance worker partition health",
				);
			}
		} catch (cause) {
			try {
				ctx.logger.warn(
					{
						...identity,
						event: "balance_worker.health_error",
						errorName: cause instanceof Error ? cause.name : "unknown_failure",
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
