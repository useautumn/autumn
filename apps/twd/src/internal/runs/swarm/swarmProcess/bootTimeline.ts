import type { WorkerBoot } from "../../../../api/contract.ts";

/** `[tw-boot] +Nms <message>` prefixes (worker/boot.ts), in boot order, naming the step each starts. */
const SANDBOX_MARKERS = [
	{ prefix: "starting native services", step: "services up" },
	{ prefix: "native services healthy", step: "balance queue prep" },
	{ prefix: "reconciling node_modules", step: "bun install" },
	{ prefix: "applying pending DB migrations", step: "db migrate" },
	{ prefix: "binding orchestrator-created Svix app", step: "svix bind" },
	{ prefix: "binding Stripe sub-account", step: "stripe bind" },
	{ prefix: "starting Autumn server", step: "server load → health" },
	{ prefix: "server health OK", step: "end" },
] as const;

const BOOT_LINE = /\[tw-boot\] \+(\d+)ms (.+)/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI colour codes
const ANSI = /\u001B\[[0-9;]*m/g;

type Trace = {
	marks: Map<string, number>;
	/** Wall-clock time boot.ts started, inferred from the first marker's arrival minus its offset. */
	bootStartedAt?: number;
	sandboxMarkers: { step: string; atMs: number }[];
	pending: string;
	done: boolean;
};

/** Per-worker boot timeline: orchestrator phases by wall clock, sandbox phases from `[tw-boot]` offsets. */
export const createBootTimeline = () => {
	const traces = new Map<string, Trace>();
	const traceOf = (worker: string) => {
		let trace = traces.get(worker);
		if (!trace) {
			trace = {
				marks: new Map(),
				sandboxMarkers: [],
				pending: "",
				done: false,
			};
			traces.set(worker, trace);
		}
		return trace;
	};

	const mark = (worker: string, event: string) => {
		traceOf(worker).marks.set(event, Date.now());
	};

	const recordOutput = (worker: string, text: string) => {
		const trace = traces.get(worker);
		if (!trace || trace.done) return;
		const lines = `${trace.pending}${text}`.split("\n");
		trace.pending = lines.pop() ?? "";
		for (const line of lines) {
			const match = BOOT_LINE.exec(line.replace(ANSI, ""));
			if (!match) continue;
			const atMs = Number(match[1]);
			trace.bootStartedAt ??= Date.now() - atMs;
			const marker = SANDBOX_MARKERS.find(({ prefix }) =>
				match[2]?.startsWith(prefix),
			);
			if (marker) trace.sandboxMarkers.push({ step: marker.step, atMs });
		}
	};

	/** Steps in order; call once the worker is mapped and serving. */
	const finish = (worker: string): WorkerBoot | null => {
		const trace = traces.get(worker);
		if (!trace) return null;
		trace.done = true;
		const at = (event: string) => trace.marks.get(event);
		const steps: WorkerBoot["steps"] = [];
		const span = (step: string, from?: number, to?: number) => {
			if (from !== undefined && to !== undefined)
				steps.push({ step, ms: Math.max(0, to - from) });
		};
		span("svix app create", at("account"), at("forkStart"));
		span("modal create", at("forkStart"), at("forkDone"));
		span("tunnel url", at("forkDone"), at("execStart"));
		span("exec → boot.ts", at("execStart"), trace.bootStartedAt);
		for (const [i, marker] of trace.sandboxMarkers.entries()) {
			const next = trace.sandboxMarkers[i + 1];
			if (next && marker.step !== "end")
				steps.push({ step: marker.step, ms: next.atMs - marker.atMs });
		}
		const healthAt = trace.sandboxMarkers.find((m) => m.step === "end");
		span(
			"ready seen by twd",
			trace.bootStartedAt !== undefined && healthAt
				? trace.bootStartedAt + healthAt.atMs
				: undefined,
			at("ready"),
		);
		span("ingress mapping", at("ready"), at("mapped"));
		const start = at("account");
		const end = at("mapped");
		return {
			steps,
			totalMs: start !== undefined && end !== undefined ? end - start : null,
		};
	};

	return { mark, recordOutput, finish };
};
