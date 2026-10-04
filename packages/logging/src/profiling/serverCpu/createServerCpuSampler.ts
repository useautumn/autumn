import { classifyServerCpuSample } from "./classifyServerCpuSample.js";
import type {
	ServerCpuBackend,
	ServerCpuPhase,
	ServerCpuSampler,
	ServerCpuWindow,
} from "./types/serverCpuProfile.js";

export function serverCpuTelemetryAllowed({
	bucket,
	bound,
}: {
	bucket: string;
	bound: boolean;
}) {
	return bucket === "autumn-staging" && bound;
}

export function createServerCpuSampler({
	bucket,
	bound,
	backend,
	shouldSample = () => true,
}: {
	bucket: string;
	bound: boolean;
	backend?: ServerCpuBackend;
	shouldSample?: () => boolean;
}): ServerCpuSampler {
	const enabled =
		serverCpuTelemetryAllowed({ bucket, bound }) && backend !== undefined;
	let pending:
		| Promise<{
				stackTraces: import("./types/serverCpuProfile.js").ServerCpuSamples;
		  }>
		| undefined;
	let finish: (() => void) | undefined;
	let threadStarted = 0;
	let processStarted = 0;
	let windowStarted = 0;

	function startWindow() {
		if (!enabled || !backend || pending || !shouldSample()) return;
		threadStarted = backend.readThreadCpuNs();
		processStarted = backend.readProcessCpuUs();
		windowStarted = backend.now();
		pending = backend.capture(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
		);
		void pending.catch(() => {});
	}

	async function finishWindow(): Promise<ServerCpuWindow | null> {
		if (!backend || !pending || !finish) return null;
		const mainThreadCpuMs = Math.max(
			0,
			(backend.readThreadCpuNs() - threadStarted) / 1e6,
		);
		const profiledProcessCpuMs = Math.max(
			0,
			(backend.readProcessCpuUs() - processStarted) / 1e3,
		);
		const profiledWindowMs = Math.max(0, backend.now() - windowStarted);
		const captured = pending;
		pending = undefined;
		finish();
		finish = undefined;
		const { stackTraces } = await captured;
		const phases = Object.fromEntries(
			[
				"auth",
				"routing",
				"balanceWorkerClient",
				"serialization",
				"logging",
				"unattributed",
			].map((phase) => [phase, { samples: 0, estimatedCpuMs: 0 }]),
		) as ServerCpuWindow["phases"];
		for (const trace of stackTraces.traces)
			phases[classifyServerCpuSample({ frames: trace.frames })].samples++;
		const samples = stackTraces.traces.length;
		for (const phase of Object.keys(phases) as ServerCpuPhase[])
			phases[phase].estimatedCpuMs =
				samples > 0
					? (mainThreadCpuMs * phases[phase].samples) / samples
					: phase === "unattributed"
						? mainThreadCpuMs
						: 0;
		return {
			estimator: "jsc-sample-share-times-main-thread-cpu",
			profiledWindowMs,
			profiledProcessCpuMs,
			mainThreadCpuMs,
			otherThreadCpuMs: Math.max(0, profiledProcessCpuMs - mainThreadCpuMs),
			gcCpuMs: null,
			sampleIntervalUs: stackTraces.interval * 1e6,
			samples,
			phases,
		};
	}

	return { enabled, startWindow, finishWindow };
}
