import { useEffect } from "react";
import { AnsiLog } from "../AnsiLog";
import type { Snapshot } from "../types";
import type { SwarmSocket } from "../useSwarmSocket";
import { Pill } from "../widgets";

export function Errors({
	snap,
	socket,
}: {
	snap: Snapshot;
	socket: SwarmSocket;
}) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: subscribe once per mount
	useEffect(() => {
		socket.subscribeErrors();
	}, []);

	const failedFiles = snap.files.filter((f) => f.status === "failed").length;

	return (
		<div className="flex h-full min-h-0 flex-col gap-3">
			<div className="flex shrink-0 items-center gap-2">
				<Pill tone={failedFiles > 0 ? "red" : "muted"}>
					✗ {failedFiles} file{failedFiles === 1 ? "" : "s"} failed
				</Pill>
				<Pill tone="yellow">{snap.run.retrying} retrying</Pill>
				<span className="text-muted-foreground text-xs">
					failure output streams here the moment a file fails
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">
				{socket.errorsOutput ? (
					<AnsiLog text={socket.errorsOutput} />
				) : (
					<div className="flex h-full items-center justify-center text-muted-foreground text-xs">
						no failures yet 🤞
					</div>
				)}
			</div>
		</div>
	);
}
