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
import { setLogSubscriber } from "../helpers/logSink.ts";
import { App } from "./App.tsx";
import { appendLog } from "./store.ts";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;
type Root = ReturnType<typeof createRoot>;

let renderer: Renderer | undefined;
let root: Root | undefined;

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
	});
	root = createRoot(renderer);
	root.render(<App />);
	setLogSubscriber(appendLog);
};

export const unmountTui = (): void => {
	setLogSubscriber(undefined);
	try {
		renderer?.destroy();
	} catch {
		// best-effort terminal restore
	}
	renderer = undefined;
	root = undefined;
};
