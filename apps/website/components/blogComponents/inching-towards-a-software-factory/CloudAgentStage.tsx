"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { AgentActivityIndicator } from "./AgentActivityIndicator";
import { CloudAgentEvidence } from "./CloudAgentEvidence";
import { CloudAgentToolCalls } from "./CloudAgentToolCalls";
import type { SessionStage } from "./cloudAgentSessionData";

const SUMMARIES = [
	"Environment ready",
	"Missing invoice item located",
	"Regression test passes",
	"Checks passed · ready for review",
];
const HANDOFFS = [
	"Next: follow the report into the logs.",
	"Next: reproduce it in a test.",
	"Next: check that nothing else broke.",
	"Ready for your review.",
];

export function CloudAgentStage({
	stage,
	index,
	active,
	time,
	playing,
	onInspect,
}: {
	stage: SessionStage;
	index: number;
	active: boolean;
	time: number;
	playing: boolean;
	onInspect: () => void;
}) {
	const reduced = useReducedMotion();
	const complete = time >= stage.end;
	const lastTool = stage.tools[stage.tools.length - 1];
	const settled = time >= lastTool.at;
	const reached = active || complete;
	return (
		<div className="relative">
			<button
				type="button"
				onClick={onInspect}
				aria-expanded={active}
				className={cn(
					"relative flex w-full items-center gap-3 rounded py-2 text-left text-[13px] leading-5 focus-visible:outline-2 focus-visible:outline-[#9564ff]",
					active ? "text-[#ddd]" : "text-[#737373] hover:text-[#aaa]",
				)}
			>
				<span
					className={cn(
						"relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full border bg-[#181818] font-mono text-[9px]",
						reached
							? "border-[#62516f] text-[#c7aedf]"
							: "border-[#333] text-[#666]",
					)}
				>
					{complete ? "✓" : index + 1}
				</span>
				<span className="font-medium">{stage.label}</span>
				{complete && !active && (
					<span className="ml-auto truncate text-[12px] text-[#7f7887]">
						{SUMMARIES[index]}
					</span>
				)}
				{active && (
					<span className="ml-auto flex items-center gap-2 text-[12px] text-[#a18faf]">
						<AgentActivityIndicator running={playing && !settled} />
						{settled ? "Done" : "In progress"}
					</span>
				)}
			</button>
			<AnimatePresence initial={false}>
				{active && (
					<motion.div
						key="content"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{
							duration: reduced ? 0 : 0.38,
							ease: [0.22, 1, 0.36, 1],
						}}
						className="overflow-hidden"
					>
						<div className="ml-8 pb-2">
							<CloudAgentToolCalls
								stage={stage}
								time={time}
								playing={playing}
							/>
							<div className="mt-3">
								<CloudAgentEvidence stage={index} time={time} />
							</div>
							<div className="mt-3 min-h-5 text-[12px] leading-5 text-[#a992bb]">
								{settled && HANDOFFS[index]}
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
