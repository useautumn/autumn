import type { AutumnLogger } from "@autumn/logging";
import type { SlotHeartbeat } from "../../blueGreen/types/slotHeartbeat.js";
import type { Partitions } from "../../partitions/types/partitions.js";
import type { OwnNetworkMonitor } from "../ownNetwork/types/ownNetworkMonitor.js";
import type { OwnNetworkVerdict } from "../ownNetwork/types/ownNetworkVerdict.js";
import { judgePeers } from "./judgePeers.js";
import type { PeerVerdict } from "./types/peerVerdict.js";
import type { StepDownController } from "./types/stepDownController.js";
import type {
	StepDownPermit,
	StepDownPermits,
} from "./types/stepDownPermits.js";

type StepDownControllerContext = {
	monitor: Pick<OwnNetworkMonitor, "onDegraded">;
	readPeers(): Promise<SlotHeartbeat[]>;
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
	peerLiveMs: number;
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
		permit: StepDownPermit | null;
		unsubscribe: (() => void) | null;
	} = { phase: "watching", permit: null, unsubscribe: null };

	function onDegraded(verdict: OwnNetworkVerdict): void {
		if (state.phase !== "watching") return;
		if (ctx.partitions.isSteppedDown() || !ctx.partitions.hasAssignment())
			return;
		state.phase = "checking";
		void decide({ verdict });
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
			state.permit = granted.permit;
			state.phase = "stepped_down";
			ctx.logger.error(
				"Own network degraded and peers healthy: stepping down",
				{
					verdict,
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
			const peers = judgePeers({
				heartbeats: await readPeersOrNone(),
				selfEndpoint: config.selfEndpoint,
				faultAt,
				now: wallNow(),
				liveMs: config.peerLiveMs,
				minPeers: config.minPeers,
			});
			if (peers.ok || now() + config.peerPollMs > deadline) return peers;
			await sleep(config.peerPollMs);
		}
	}

	async function readPeersOrNone(): Promise<SlotHeartbeat[]> {
		try {
			return await ctx.readPeers();
		} catch (cause) {
			ctx.logger.warn("Peer heartbeats could not be read", { error: cause });
			return [];
		}
	}

	function start(): void {
		if (state.unsubscribe) return;
		state.unsubscribe = ctx.monitor.onDegraded(onDegraded);
	}

	async function stop(): Promise<void> {
		state.unsubscribe?.();
		state.unsubscribe = null;
		const { permit } = state;
		if (!permit) return;
		try {
			await ctx.permits.release({ permit });
			state.permit = null;
		} catch (cause) {
			ctx.logger.warn("Step-down permit not released; it expires on its own", {
				error: cause,
			});
		}
	}

	return { start, stop };
}
