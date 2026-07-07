import { useEffect } from "react";
import { TerminalOutput } from "../Terminal";
import type { Snapshot } from "../types";
import type { SwarmSocket } from "../useSwarmSocket";
import { Pill, sortFilesForTriage } from "../widgets";

/**
 * Live failure view. The headline list derives from the SNAPSHOT (failedTests
 * per file — always present the moment a file fails); the raw output stream
 * below adds verbatim failure detail as it arrives.
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

	const failed = sortFilesForTriage(
		snap.files.filter(
			(f) =>
				f.status === "failed" ||
				f.status === "retrying" ||
				f.failedTests.length > 0,
		),
	);

	return (
		<div className="flex h-full min-h-0 flex-col gap-3">
			<div className="flex shrink-0 items-center gap-2">
				<Pill tone={snap.run.failed > 0 ? "red" : "muted"}>
					✗ {snap.run.failed} failed
				</Pill>
				<Pill tone="yellow">{snap.run.retrying} retrying</Pill>
				<span className="text-muted-foreground text-xs">
					failures appear here the moment they happen — retrying files may still
					recover
				</span>
			</div>
			{failed.length > 0 ? (
				<div className="max-h-[45%] shrink-0 overflow-auto rounded-lg border bg-card">
					<div className="divide-y">
						{failed.map((f) => (
							<div className="px-3 py-2" key={f.file}>
								<div className="mb-1 flex items-center gap-2">
									<span className="font-mono text-red-400 text-xs">
										✗ {f.name}
									</span>
									{f.status === "retrying" ? (
										<Pill tone="yellow">retrying</Pill>
									) : null}
									{f.worker ? (
										<span className="text-subtle text-xs">on {f.worker}</span>
									) : null}
								</div>
								<ul className="flex flex-col gap-0.5">
									{f.failedTests.map((t) => (
										<li
											className="font-mono text-xs"
											key={`${t.name}-${t.location ?? ""}`}
										>
											<span className="text-red-400">✗</span> {t.name}
											{t.location ? (
												<span className="text-subtle"> — {t.location}</span>
											) : null}
											{t.message ? (
												<div className="pl-4 text-muted-foreground">
													{t.message}
												</div>
											) : null}
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</div>
			) : null}
			<div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">
				{socket.errorsOutput ? (
					<TerminalOutput text={socket.errorsOutput} />
				) : (
					<div className="flex h-full items-center justify-center text-muted-foreground text-xs">
						{failed.length > 0
							? "raw failure output streams here as retries conclude"
							: "no failures yet 🤞"}
					</div>
				)}
			</div>
		</div>
	);
}
