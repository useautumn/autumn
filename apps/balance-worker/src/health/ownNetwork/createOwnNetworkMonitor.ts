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
import type {
	OwnNetworkSample,
	PartitionSendSample,
} from "./types/ownNetworkSample.js";
import type { OwnNetworkVerdict } from "./types/ownNetworkVerdict.js";
import type { PartitionSendWatches } from "./types/partitionSendWatches.js";

type HeldSendSample = PartitionSendSample & { holding: number };

type HeldNetworkSample = Omit<OwnNetworkSample, "sends"> & {
	sends: HeldSendSample[];
};

type OwnNetworkMonitorContext = {
	sends: Pick<PartitionSendWatches, "take">;
	isHeld?(params: { partition: number }): boolean;
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
		samples: HeldNetworkSample[];
		lastTcp: TcpCounters | null;
		holdings: Map<number, number>;
		nextHolding: number;
		cancel: (() => void) | null;
	} = {
		samples: [],
		lastTcp: null,
		holdings: new Map(),
		nextHolding: 0,
		cancel: null,
	};

	function isHeld(partition: number): boolean {
		return ctx.isHeld?.({ partition }) ?? true;
	}

	function forgetReleasedHoldings(): void {
		for (const partition of [...state.holdings.keys()])
			if (!isHeld(partition)) state.holdings.delete(partition);
	}

	function holdingOf(partition: number): number {
		const known = state.holdings.get(partition);
		if (known !== undefined) return known;
		const holding = state.nextHolding++;
		state.holdings.set(partition, holding);
		return holding;
	}

	function judge(at: number): OwnNetworkVerdict {
		forgetReleasedHoldings();
		const samples = state.samples.map((kept) => ({
			...kept,
			sends: kept.sends.filter(
				({ partition, holding }) => state.holdings.get(partition) === holding,
			),
		}));
		return judgeOwnNetwork({ samples, now: at, thresholds });
	}

	function sample(): void {
		const at = now();
		const tcp = readTcp();
		const previous = state.lastTcp;
		state.lastTcp = tcp;
		forgetReleasedHoldings();
		const sends: HeldSendSample[] = [];
		for (const send of ctx.sends.take({ now: at }))
			if (isHeld(send.partition))
				sends.push({ ...send, holding: holdingOf(send.partition) });
		state.samples.push({
			at,
			tcp: tcp && previous ? tcpWindowOf({ previous, current: tcp }) : null,
			sends,
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
