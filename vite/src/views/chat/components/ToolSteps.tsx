import { Shimmer } from "@autumn/ui/ai-elements";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LeafStepData } from "../chatTypes";

/** A step (tool call) or a line of the agent's process narration ("reasoning"),
 * both shown inside the collapsible "Worked" group. */
export type WorkedEntry =
	| { type: "step"; step: LeafStepData }
	| { type: "reasoning"; text: string };

/** A tool the agent ran, shown as a compact step row. */
function ToolStep({ step }: { step: LeafStepData }) {
	const icon =
		step.status === "done" ? "✓" : step.status === "error" ? "⚠" : "◷";
	return (
		<div
			className={cn(
				"flex items-center gap-2 text-xs",
				step.status === "error"
					? "text-red-600 dark:text-red-500"
					: "text-tertiary-foreground",
			)}
		>
			<span className={cn(step.status === "running" && "animate-pulse")}>
				{icon}
			</span>
			{step.status === "running" ? (
				<Shimmer>{step.label}</Shimmer>
			) : (
				<span>{step.label}</span>
			)}
		</div>
	);
}

/** The agent's process narration, muted and blockquote-styled. */
function ReasoningLine({ text }: { text: string }) {
	return (
		<div className="border-border border-l-2 pl-2 text-tertiary-foreground text-xs italic">
			{text}
		</div>
	);
}

/** The agent's process for a message — tool calls + reasoning narration —
 * grouped under a collapsible "Working…/Worked" header (auto-expanded while a
 * step is running). Mirrors a classic agentic step list. */
export function ToolStepsGroup({ entries }: { entries: WorkedEntry[] }) {
	const [open, setOpen] = useState(false);
	const anyRunning = entries.some(
		(entry) => entry.type === "step" && entry.step.status === "running",
	);
	const expanded = open || anyRunning;
	return (
		<div className="flex flex-col gap-1">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="flex w-fit items-center gap-1 text-tertiary-foreground text-xs hover:text-foreground"
			>
				<ChevronRight
					className={cn("size-3 transition-transform", expanded && "rotate-90")}
				/>
				<span>{anyRunning ? "Working…" : "Worked"}</span>
			</button>
			{expanded && (
				<div className="ml-[7px] flex flex-col gap-1.5 border-border border-l pl-3">
					{entries.map((entry, index) =>
						entry.type === "step" ? (
							<ToolStep key={index} step={entry.step} />
						) : (
							<ReasoningLine key={index} text={entry.text} />
						),
					)}
				</div>
			)}
		</div>
	);
}
