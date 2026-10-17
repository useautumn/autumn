import { BALANCE_WORKER_OWN_NETWORK_SAMPLE_MS } from "@autumn/env/balanceWorkerConstants";
import {
	readTcpCounters,
	type TcpCounters,
	tcpWindowOf,
} from "../../logging/eventLoopStalls/tcpCounters.js";
import {
	DEFAULT_OWN_NETWORK_THRESHOLDS,
	judgeOwnNetwork,
	type OwnNetworkThresholds,
} from "./judgeOwnNetwork.js";
import type { OwnNetworkMonitor } from "./types/ownNetworkMonitor.js";
import type { OwnNetworkSample } from "./types/ownNetworkSample.js";
import type { OwnNetworkVerdict } from "./types/ownNetworkVerdict.js";
import type {
	PartitionHolding,
	PartitionSendWatches,
} from "./types/partitionSendWatches.js";

type OwnNetworkMonitorContext = {
	sends: Pick<PartitionSendWatches, "take">;
	holdingOf(params: { partition: number }): number | undefined;
	heldCount(): number;
	readTcp?: () => TcpCounters | null;
	now?: () => number;
	schedule?: (params: { intervalMs: number; run(): void }) => () => void;
};

export function createOwnNetworkMonitor({
	ctx,
	config = {},
}: {
	ctx: OwnNetworkMonitorContext;
	config?: { sampleMs?: number; thresholds?: OwnNetworkThresholds };
}): OwnNetworkMonitor {
	const now = ctx.now ?? (() => performance.now());
	const readTcp = ctx.readTcp ?? (() => readTcpCounters());
	const schedule = ctx.schedule ?? scheduleSamples;
	const sampleMs = config.sampleMs ?? BALANCE_WORKER_OWN_NETWORK_SAMPLE_MS;
	const thresholds = config.thresholds ?? DEFAULT_OWN_NETWORK_THRESHOLDS;
	const keepMs = thresholds.windowMs + sampleMs * 2;
	const listeners = new Set<(verdict: OwnNetworkVerdict) => void>();
	const state: {
		samples: OwnNetworkSample[];
		lastTcp: TcpCounters | null;
		cancel: (() => void) | null;
	} = {
		samples: [],
		lastTcp: null,
		cancel: null,
	};

	function isCurrent({ partition, holding }: PartitionHolding): boolean {
		return ctx.holdingOf({ partition }) === holding;
	}

	function judge(at: number): OwnNetworkVerdict {
		const samples = state.samples.map((kept) => ({
			...kept,
			sends: kept.sends.filter(isCurrent),
		}));
		return judgeOwnNetwork({
			samples,
			now: at,
			heldPartitions: ctx.heldCount(),
			thresholds,
		});
	}

	function sample(): void {
		const at = now();
		const tcp = readTcp();
		const previous = state.lastTcp;
		state.lastTcp = tcp;
		state.samples.push({
			at,
			tcp: tcp && previous ? tcpWindowOf({ previous, current: tcp }) : null,
			sends: ctx.sends.take({ now: at, isCurrent }),
		});
		state.samples = state.samples.filter((kept) => kept.at > at - keepMs);
		const latest = judge(at);
		if (latest.state !== "degraded") return;
		for (const listener of [...listeners]) listener(latest);
	}

	function start(): void {
		if (state.cancel) return;
		state.lastTcp = readTcp();
		state.cancel = schedule({ intervalMs: sampleMs, run: sample });
	}

	function stop(): void {
		state.cancel?.();
		state.cancel = null;
	}

	function verdict(): OwnNetworkVerdict {
		return judge(now());
	}

	function onDegraded(
		listener: (verdict: OwnNetworkVerdict) => void,
	): () => void {
		listeners.add(listener);
		function unsubscribe(): void {
			listeners.delete(listener);
		}
		return unsubscribe;
	}

	return { start, stop, verdict, onDegraded };
}

function scheduleSamples({
	intervalMs,
	run,
}: {
	intervalMs: number;
	run(): void;
}): () => void {
	const timer = setInterval(run, intervalMs);
	timer.unref?.();
	function cancel(): void {
		clearInterval(timer);
	}
	return cancel;
}
