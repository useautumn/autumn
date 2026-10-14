import { Shimmer } from "@autumn/ui/ai-elements";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { LeafStepData } from "../chatTypes";

export type WorkedEntry =
	| { type: "step"; step: LeafStepData }
	| { type: "reasoning"; text: string };

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

function ReasoningLine({ text }: { text: string }) {
	return (
		<div className="border-border border-l-2 pl-2 text-tertiary-foreground text-xs italic">
			{text}
		</div>
	);
}

const WORKING_LABELS = [
	"Working…",
	"Crunching the numbers…",
	"Consulting the ledger…",
	"Reading the fine print…",
	"Carrying the one…",
	"Balancing the books…",
];
const WORKING_LABEL_INTERVAL_MS = 4000;

export function ToolStepsGroup({
	active,
	entries,
}: {
	active: boolean;
	entries: WorkedEntry[];
}) {
	const [open, setOpen] = useState(active);
	const [labelIndex, setLabelIndex] = useState(0);
	const userControlled = useRef(false);
	useEffect(() => {
		if (userControlled.current) return;
		setOpen(active);
	}, [active]);
	useEffect(() => {
		if (!active) {
			setLabelIndex(0);
			return;
		}
		const interval = window.setInterval(
			() => setLabelIndex((index) => (index + 1) % WORKING_LABELS.length),
			WORKING_LABEL_INTERVAL_MS,
		);
		return () => window.clearInterval(interval);
	}, [active]);
	return (
		<div className="flex flex-col gap-1">
			<button
				type="button"
				onClick={() => {
					userControlled.current = true;
					setOpen((value) => !value);
				}}
				className="flex w-fit items-center gap-1 text-tertiary-foreground text-xs hover:text-foreground"
			>
				<ChevronRight
					className={cn("size-3 transition-transform", open && "rotate-90")}
				/>
				{active ? (
					<Shimmer>{WORKING_LABELS[labelIndex]}</Shimmer>
				) : (
					<span>Worked</span>
				)}
			</button>
			<div
				className={cn(
					"grid transition-[grid-template-rows] duration-150 ease-in-out",
					open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				<div className="ml-[7px] flex flex-col gap-1.5 overflow-hidden border-border border-l pl-3">
					{entries.map((entry, index) =>
						entry.type === "step" ? (
							<ToolStep key={index} step={entry.step} />
						) : (
							<ReasoningLine key={index} text={entry.text} />
						),
					)}
				</div>
			</div>
		</div>
	);
}
