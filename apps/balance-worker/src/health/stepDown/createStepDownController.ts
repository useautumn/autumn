import type { AutumnLogger } from "@autumn/logging";
import type { Partitions } from "../../partitions/types/partitions.js";
import type { OwnNetworkMonitor } from "../ownNetwork/types/ownNetworkMonitor.js";
import type { OwnNetworkVerdict } from "../ownNetwork/types/ownNetworkVerdict.js";
import { judgePeers } from "./judgePeers.js";
import type { FleetListing, FleetRead } from "./types/fleetHeartbeats.js";
import type { PeerVerdict } from "./types/peerVerdict.js";
import type { StepDownController } from "./types/stepDownController.js";
import type {
	StepDownPermit,
	StepDownPermits,
} from "./types/stepDownPermits.js";

type StepDownControllerContext = {
	monitor: Pick<OwnNetworkMonitor, "onDegraded" | "verdict">;
	readPeers(params: { since: FleetListing | null }): Promise<FleetRead>;
	permits: StepDownPermits;
	partitions: Pick<Partitions, "stepDown" | "isSteppedDown" | "hasAssignment">;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
};

type StepDownControllerConfig = {
	selfEndpoint: string;
	peerWaitMs: number;
	peerPollMs: number;
	partitionCount: number;
	ackAgeLimitMs: number;
	minPeers: number;
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
			const peers = await awaitPeersVouching();
			if (!isEligible()) return;
			if (!peers.ok) {
				ctx.logger.warn(
					"Own network degraded, but peers do not vouch for theirs: staying",
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
			const current = ctx.monitor.verdict();
			if (hasRecovered(current) || !isEligible()) {
				ctx.logger.warn("Own network recovered before the step-down: staying", {
					verdict: current,
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

	async function awaitPeersVouching(): Promise<PeerVerdict> {
		const baseline = await readPeersOrNone({ since: null });
		let peers = judgeWritten({ heartbeats: [] });
		if (!baseline) return peers;
		const deadline = now() + config.peerWaitMs;
		while (!state.stopped && now() + config.peerPollMs <= deadline) {
			await sleep(config.peerPollMs);
			const read = await readPeersOrNone({ since: baseline.listing });
			peers = judgeWritten({ heartbeats: read?.changed ?? [] });
			if (peers.ok) return peers;
		}
		return peers;
	}

	function judgeWritten({
		heartbeats,
	}: {
		heartbeats: FleetRead["changed"];
	}): PeerVerdict {
		return judgePeers({
			heartbeats,
			selfEndpoint: config.selfEndpoint,
			partitionCount: config.partitionCount,
			ackAgeLimitMs: config.ackAgeLimitMs,
			minPeers: config.minPeers,
		});
	}

	async function readPeersOrNone({
		since,
	}: {
		since: FleetListing | null;
	}): Promise<FleetRead | null> {
		try {
			return await ctx.readPeers({ since });
		} catch (cause) {
			ctx.logger.warn("Peer heartbeats could not be read", { error: cause });
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

function hasRecovered(verdict: OwnNetworkVerdict): boolean {
	return verdict.state !== "insufficient_data" && !verdict.losesPackets;
}
