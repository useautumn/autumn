/** @jsxImportSource @opentui/react */
/**
 * Mount/unmount the opentui swarm TUI and bridge orchestrator logs into Pane B.
 *
 * Lifecycle:
 *   - `mountTui()` creates the renderer (we OWN signal handling: `exitSignals:[]`
 *     + `exitOnCtrlC:false`, so the orchestrator's existing SIGINT teardown stays
 *     in charge), renders <App/>, and registers the log-sink subscriber so every
 *     `sink`/`sinkLine` line flows into the logs pane.
 *   - `unmountTui()` clears the subscriber and `destroy()`s the renderer (restores
 *     the terminal). Idempotent and never throws — teardown must not be blocked by
 *     a render-teardown hiccup.
 *
 * Only mounted for an interactive TTY; non-TTY callers (CI, piped output) skip the
 * TUI and let the sink write to stdout as before.
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { setLogSubscriber, sinkLine } from "../helpers/logSink.ts";
import { App } from "./App.tsx";
import { appendLog } from "./store.ts";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;
type Root = ReturnType<typeof createRoot>;

let renderer: Renderer | undefined;
let root: Root | undefined;

// Stray `console.*` calls (the @vercel/sandbox SDK, server modules, Stripe retry
// warnings) would otherwise corrupt the TUI or get swallowed by opentui's debug
// console overlay. While mounted, redirect them through the log sink so they land
// (ANSI-stripped) in the logs pane. Restored on unmount.
const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;
type ConsoleMethod = (typeof CONSOLE_METHODS)[number];
const savedConsole: Partial<
	Record<ConsoleMethod, (...args: unknown[]) => void>
> = {};

const formatConsoleArgs = (args: unknown[]): string =>
	args
		.map((arg) => {
			if (typeof arg === "string") {
				return arg;
			}
			if (arg instanceof Error) {
				return arg.stack ?? arg.message;
			}
			try {
				return JSON.stringify(arg);
			} catch {
				return String(arg);
			}
		})
		.join(" ");

const redirectConsole = (): void => {
	for (const method of CONSOLE_METHODS) {
		savedConsole[method] = console[method] as (...args: unknown[]) => void;
		console[method] = (...args: unknown[]): void => {
			sinkLine(formatConsoleArgs(args));
		};
	}
};

const restoreConsole = (): void => {
	for (const method of CONSOLE_METHODS) {
		const original = savedConsole[method];
		if (original) {
			console[method] = original as typeof console.log;
		}
		delete savedConsole[method];
	}
};

/** Whether an interactive TUI can be mounted (an actual TTY is attached). */
export const canUseTui = (): boolean => Boolean(process.stdout.isTTY);

export const mountTui = async (): Promise<void> => {
	if (renderer) {
		return;
	}
	renderer = await createCliRenderer({
		exitOnCtrlC: false,
		exitSignals: [],
		targetFps: 30,
		// We own the terminal: never let opentui's debug console overlay take over
		// (it was hijacking the screen on stray console.* + errors).
		consoleMode: "disabled",
		openConsoleOnError: false,
	});
	root = createRoot(renderer);
	root.render(<App />);
	setLogSubscriber(appendLog);
	redirectConsole();
};

export const unmountTui = (): void => {
	restoreConsole();
	setLogSubscriber(undefined);
	try {
		renderer?.destroy();
	} catch {
		// best-effort terminal restore
	}
	renderer = undefined;
	root = undefined;
};
