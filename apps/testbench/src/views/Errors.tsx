import { useEffect } from "react";
import { TerminalOutput } from "../Terminal";
import type { Snapshot } from "../types";
import type { SwarmSocket } from "../useSwarmSocket";
import { Pill } from "../widgets";

/**
 * Live failure feed: every failed file's failure detail streams in the moment
 * it fails — no waiting for the run to finish. Read-only wterm surface.
 */
export function Errors({
	snap,
	socket,
}: {
	snap: Snapshot;
	socket: SwarmSocket;
}) {
	// Subscribe once on mount; the server replays the buffer so far, then streams.
	useEffect(() => {
		socket.subscribeErrors();
		// biome-ignore lint/correctness/useExhaustiveDependencies: subscribe once per mount
	}, []);

	return (
		<div className="flex h-full min-h-0 flex-col gap-3">
			<div className="flex shrink-0 items-center gap-2">
				<Pill tone={snap.run.failed > 0 ? "red" : "muted"}>
					✗ {snap.run.failed} failed
				</Pill>
				<Pill tone="yellow">{snap.run.retrying} retrying</Pill>
				<span className="text-muted-foreground text-xs">
					failures stream here live — first attempts marked (retrying) may still
					recover
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">
				{socket.errorsOutput ? (
					<TerminalOutput text={socket.errorsOutput} />
				) : (
					<div className="flex h-full items-center justify-center text-muted-foreground text-xs">
						no failures yet 🤞
					</div>
				)}
			</div>
		</div>
	);
}
