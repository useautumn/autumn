"use client";

import { CloudAgentStage } from "./CloudAgentStage";
import { SESSION_DURATION_MS, SESSION_STAGES } from "./cloudAgentSessionData";
import { useCloudAgentSession } from "./useCloudAgentSession";

export function CloudAgentSession() {
	const { ref, time, playing, stageIndex, toggle, replay, inspect } =
		useCloudAgentSession();
	const complete = time >= SESSION_DURATION_MS && stageIndex === 3;
	let playbackLabel = "Play";
	if (playing) playbackLabel = "Pause";
	if (complete) playbackLabel = "Replay";
	return (
		<figure
			ref={ref}
			className="not-prose my-8 flex h-[560px] flex-col overflow-hidden rounded-xl border border-[#303030] bg-[#181818] text-[#c9c9c9]"
		>
			<div className="flex shrink-0 items-center gap-2 border-b border-[#292929] bg-[#202020] px-4 py-2.5 text-[13px]">
				<span className="font-medium text-[#ddd]">Missing overage charges</span>
				<span className="ml-auto text-[12px] text-[#888]">Cloud agent</span>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 [scrollbar-gutter:stable] [scrollbar-width:thin]">
				<div className="ml-auto w-fit max-w-[95%] rounded-lg border border-[#323232] bg-[#242424] px-3 py-2 text-[13px] leading-5">
					<span className="mr-2 font-mono text-[#c5a6e4]">/tdd</span>Fix the
					missing overage charge.
					<span className="ml-2 whitespace-nowrap text-[12px] text-[#888]">
						↗ Slack
					</span>
				</div>
				<div className="relative mt-3">
					<div
						aria-hidden="true"
						className="absolute bottom-5 left-[9px] top-5 w-px bg-[#353039]"
					/>
					{SESSION_STAGES.map((stage, index) => (
						<CloudAgentStage
							key={stage.id}
							stage={stage}
							index={index}
							active={stageIndex === index}
							time={time}
							playing={playing}
							onInspect={() => inspect(index)}
						/>
					))}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-3 border-t border-[#292929] bg-[#151515] px-4 py-2 font-mono text-[12px]">
				<button
					type="button"
					onClick={toggle}
					className="rounded border border-[#3d3746] px-2 py-1 text-[#baa6d0] hover:bg-[#27222e] focus-visible:outline-[#9564ff]"
				>
					{playbackLabel}
				</button>
				<div
					className="h-0.5 flex-1 overflow-hidden bg-[#303030]"
					aria-hidden="true"
				>
					<div
						className="h-full origin-left bg-[#9273b8]"
						style={{ transform: `scaleX(${time / SESSION_DURATION_MS})` }}
					/>
				</div>
				<span className="hidden text-[9px] text-[#666] sm:block">
					Illustrative session
				</span>
				<button
					type="button"
					onClick={replay}
					aria-label="Restart session"
					className="px-1 text-[#888] hover:text-white"
				>
					↺
				</button>
			</div>
			<figcaption className="sr-only">
				Illustrative agent session with sample outputs, not a live
				investigation.
			</figcaption>
		</figure>
	);
}
