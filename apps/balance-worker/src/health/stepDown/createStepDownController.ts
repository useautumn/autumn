import type { AutumnLogger } from "@autumn/logging";
import type { Partitions } from "../../partitions/types/partitions.js";
import type { OwnNetworkMonitor } from "../ownNetwork/types/ownNetworkMonitor.js";
import type { OwnNetworkVerdict } from "../ownNetwork/types/ownNetworkVerdict.js";
import { judgePeers } from "./judgePeers.js";
import type { FleetHeartbeats } from "./types/fleetHeartbeats.js";
import type { PeerVerdict } from "./types/peerVerdict.js";
import type { StepDownController } from "./types/stepDownController.js";
import type {
	StepDownPermit,
	StepDownPermits,
} from "./types/stepDownPermits.js";

type StepDownControllerContext = {
	monitor: Pick<OwnNetworkMonitor, "onDegraded" | "verdict">;
	readPeers(): Promise<FleetHeartbeats>;
	permits: StepDownPermits;
	partitions: Pick<Partitions, "stepDown" | "isSteppedDown" | "hasAssignment">;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	now?: () => number;
	wallNow?: () => number;
	sleep?: (ms: number) => Promise<void>;
};

type StepDownControllerConfig = {
	selfEndpoint: string;
	peerWaitMs: number;
	peerPollMs: number;
	membershipMs: number;
	skewMs: number;
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
	const wallNow = ctx.wallNow ?? Date.now;
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
			const faultAt =
				wallNow() - (now() - (verdict.windowStartedAt ?? verdict.at));
			const peers = await awaitPeersVouching({ faultAt });
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
			if (current.state !== "degraded" || !isEligible()) {
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

	async function awaitPeersVouching({
		faultAt,
	}: {
		faultAt: number;
	}): Promise<PeerVerdict> {
		const deadline = now() + config.peerWaitMs;
		for (;;) {
			const { heartbeats, unreadable } = await readPeersOrNone();
			const peers = judgePeers({
				heartbeats,
				unreadable,
				selfEndpoint: config.selfEndpoint,
				faultAt,
				now: wallNow(),
				membershipMs: config.membershipMs,
				skewMs: config.skewMs,
				minPeers: config.minPeers,
			});
			if (peers.ok || state.stopped || now() + config.peerPollMs > deadline)
				return peers;
			await sleep(config.peerPollMs);
		}
	}

	async function readPeersOrNone(): Promise<FleetHeartbeats> {
		try {
			return await ctx.readPeers();
		} catch (cause) {
			ctx.logger.warn("Peer heartbeats could not be read", { error: cause });
			return { heartbeats: [], unreadable: 0 };
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
