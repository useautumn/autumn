"use client";

import { TestPoolCanvas } from "./TestPoolCanvas";
import { END_MS, getPoolState } from "./testPoolSimulation";
import { useTestPoolRun } from "./useTestPoolRun";

export function ParallelTestPool() {
	const { ref, time, running, replay } = useTestPoolRun();
	const { status } = getPoolState(time);
	const complete = time >= END_MS;
	return (
		<figure
			ref={ref}
			className="not-prose my-8 overflow-hidden rounded-xl border border-[#292929] bg-[#0F0F0F]"
		>
			<div className="flex flex-wrap items-center gap-3 border-b border-[#292929] px-4 py-3">
				<code className="font-mono text-[12px] text-[#e5e5e5]">bun tw</code>
				<output className="font-mono text-[11px] text-[#FFFFFF66]">
					{status}
				</output>
				<button
					type="button"
					disabled={running}
					onClick={replay}
					className="ml-auto rounded-md border border-[#48315f] bg-[#241630] px-3 py-1 font-mono text-[11px] text-[#dcc4ff] hover:bg-[#30203e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9564ff] disabled:opacity-40"
				>
					{complete ? "Run again" : "Run suite"}
				</button>
			</div>
			<div className="px-2 py-3 sm:px-3">
				<TestPoolCanvas time={time} />
			</div>
			<figcaption className="border-t border-[#292929] px-4 py-2.5 font-mono text-[10px] text-[#FFFFFF66]">
				{complete
					? "24 passed · 1 retried · workers shut down"
					: "3 isolated workers · up to 3 test files each"}
				<span className="ml-2 text-[#FFFFFF40]">
					Illustrative run · time compressed
				</span>
			</figcaption>
		</figure>
	);
}
