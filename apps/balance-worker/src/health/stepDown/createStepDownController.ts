import type { AutumnLogger } from "@autumn/logging";
import type { Partitions } from "../../partitions/types/partitions.js";
import type { OwnNetworkMonitor } from "../ownNetwork/types/ownNetworkMonitor.js";
import type { OwnNetworkVerdict } from "../ownNetwork/types/ownNetworkVerdict.js";
import { judgeFleetProgress } from "./judgeFleetProgress.js";
import type { FleetCheck, TimedFleetProgress } from "./types/fleetProgress.js";
import type { StepDownController } from "./types/stepDownController.js";
import type {
	StepDownPermit,
	StepDownPermits,
} from "./types/stepDownPermits.js";

type StepDownControllerContext = {
	monitor: Pick<OwnNetworkMonitor, "onDegraded" | "verdict">;
	readFleetProgress(): Promise<TimedFleetProgress>;
	ownPartitions(): ReadonlySet<number>;
	permits: StepDownPermits;
	partitions: Pick<
		Partitions,
		"stepDown" | "isSteppedDown" | "hasAssignment" | "holdingOf"
	>;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
};

type StepDownControllerConfig = {
	peerWaitMs: number;
	peerPollMs: number;
	minKeptUp: number;
	maxOwnerLagMs: number;
	maxObservationMs: number;
	recheckAttempts: number;
	recheckIntervalMs: number;
	minStalledPartitions: number;
};

export function createStepDownController({
	ctx,
	config,
}: {
	ctx: StepDownControllerContext;
	config: StepDownControllerConfig;
}): StepDownController {
	const now = ctx.now ?? (() => performance.now());
	const sleep = ctx.sleep ?? Bun.sleep;
	const state: {
		phase: "watching" | "checking" | "stepped_down";
		stopped: boolean;
		permit: StepDownPermit | null;
		decision: Promise<void> | null;
		unsubscribe: (() => void) | null;
	} = {
		phase: "watching",
		stopped: false,
		permit: null,
		decision: null,
		unsubscribe: null,
	};

	function isEligible(): boolean {
		return (
			!state.stopped &&
			!ctx.partitions.isSteppedDown() &&
			ctx.partitions.hasAssignment()
		);
	}

	function onDegraded(verdict: OwnNetworkVerdict): void {
		if (state.phase !== "watching" || !isEligible()) return;
		state.phase = "checking";
		state.decision = decide({ verdict });
	}

	async function decide({
		verdict,
	}: {
		verdict: OwnNetworkVerdict;
	}): Promise<void> {
		try {
			const fleet = await awaitFleetKeepingUp();
			if (!isEligible()) return;
			if (!fleet.judged) {
				ctx.logger.warn(
					"Own network degraded, but fleet progress could not be judged: staying",
					{ verdict },
				);
				return;
			}
			const peers = fleet.verdict;
			if (!peers.ok) {
				ctx.logger.warn(
					"Own network degraded, but the fleet is not keeping up: staying",
					{ verdict, peers },
				);
				return;
			}
			const granted = await ctx.permits.acquire();
			if (!granted.ok) {
				ctx.logger.error(
					"Own network degraded and peers healthy, but no step-down permit: staying",
					{ verdict, peers, reason: granted.reason, error: granted.cause },
				);
				return;
			}
			const current = await awaitContinuingLoss({ trigger: verdict });
			if (!current || !isEligible()) {
				ctx.logger.warn("Own network recovered before the step-down: staying", {
					verdict: ctx.monitor.verdict(),
				});
				if (!(await releasePermit({ permit: granted.permit })))
					state.permit = granted.permit;
				return;
			}
			state.permit = granted.permit;
			state.phase = "stepped_down";
			ctx.logger.error(
				"Own network degraded and peers healthy: stepping down",
				{
					verdict: current,
					peers,
					permitSlot: granted.permit.slot,
				},
			);
			await ctx.partitions.stepDown();
			ctx.logger.info(
				"Stepped down: out of the group and refusing routes until replaced",
			);
		} catch (cause) {
			ctx.logger.error("Step-down check failed: staying", { error: cause });
		} finally {
			if (state.phase === "checking") state.phase = "watching";
		}
	}

	async function awaitContinuingLoss({
		trigger,
	}: {
		trigger: OwnNetworkVerdict;
	}): Promise<OwnNetworkVerdict | null> {
		for (let attempt = 1; attempt <= config.recheckAttempts; attempt++) {
			const current = ctx.monitor.verdict();
			if (current.losesPackets && stillHoldsStalls({ trigger, current }))
				return current;
			if (attempt < config.recheckAttempts && !state.stopped)
				await sleep(config.recheckIntervalMs);
		}
		return null;
	}

	function stillHoldsStalls({
		trigger,
		current,
	}: {
		trigger: OwnNetworkVerdict;
		current: OwnNetworkVerdict;
	}): boolean {
		const stillStalled = trigger.stalledHoldings.filter(
			({ partition, holding }) =>
				ctx.partitions.holdingOf({ partition }) === holding,
		).length;
		const busy = Math.max(trigger.busyPartitions, current.busyPartitions);
		return (
			stillStalled >= config.minStalledPartitions && stillStalled * 2 > busy
		);
	}

	async function awaitFleetKeepingUp(): Promise<FleetCheck> {
		const baseline = await readProgressOrNone();
		let check: FleetCheck = { judged: false };
		if (!baseline) return check;
		const deadline = baseline.completedAt + config.peerWaitMs;
		while (!state.stopped && now() + config.peerPollMs <= deadline) {
			await sleep(config.peerPollMs);
			const current = await readProgressOrNone();
			if (!current || current.completedAt > deadline) continue;
			const verdict = judgeFleetProgress({
				before: baseline.progress,
				after: current.progress,
				ownPartitions: ctx.ownPartitions(),
				minKeptUp: config.minKeptUp,
				elapsedMs: current.completedAt - baseline.progress.readStartedAt,
				maxLagMs: config.maxOwnerLagMs,
			});
			check = { judged: true, verdict };
			if (verdict.ok) return check;
		}
		return check;
	}

	async function readProgressOrNone(): Promise<{
		progress: TimedFleetProgress;
		completedAt: number;
	} | null> {
		try {
			const progress = await ctx.readFleetProgress();
			const completedAt = now();
			if (completedAt - progress.readStartedAt <= config.maxObservationMs)
				return { progress, completedAt };
			ctx.logger.warn("Fleet progress was read too slowly to judge", {
				readMs: completedAt - progress.readStartedAt,
			});
			return null;
		} catch (cause) {
			ctx.logger.warn("Fleet progress could not be read", { error: cause });
			return null;
		}
	}

	async function releasePermit({
		permit,
	}: {
		permit: StepDownPermit;
	}): Promise<boolean> {
		try {
			await ctx.permits.release({ permit });
			return true;
		} catch (cause) {
			ctx.logger.error(
				"Step-down permit not released; it holds its slot until released",
				{ error: cause, permitSlot: permit.slot },
			);
			return false;
		}
	}

	function start(): void {
		if (state.unsubscribe || state.stopped) return;
		state.unsubscribe = ctx.monitor.onDegraded(onDegraded);
	}

	async function stop(): Promise<void> {
		state.stopped = true;
		state.unsubscribe?.();
		state.unsubscribe = null;
		await state.decision;
		const { permit } = state;
		state.permit = null;
		if (permit) await releasePermit({ permit });
	}

	return { start, stop };
}
