"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Toggle, useConfigSim } from "./configSim";
import { type ChangeId, ENTER, LAYOUT } from "./shared";

type CodeLine = {
	id: string;
	text: string;
	isNew?: boolean;
	blank?: boolean;
	comment?: string;
};

// The "config in code" panel as it forks under each applied change.
function buildCodeLines(applied: Set<ChangeId>): CodeLine[] {
	const lines: CodeLine[] = [
		{ id: "open", text: "const plans = {" },
		{ id: "free", text: "  free: { price: 0, credits: 50 }," },
	];

	if (applied.has("version")) {
		lines.push({ id: "pro-open", text: "  pro: {", isNew: true });
		lines.push({
			id: "v1",
			text: "    v1: { price: 20, credits: 200 },",
			isNew: true,
		});
		lines.push({
			id: "v2",
			text: "    v2: { price: 40, credits: 400 },",
			isNew: true,
		});
		lines.push({ id: "pro-close", text: "  }," });
	} else {
		lines.push({ id: "pro", text: "  pro: { price: 20, credits: 200 }," });
	}

	lines.push(
		applied.has("version")
			? {
					id: "close",
					text: "};",
					comment: "  // + migration: customers.plan_version",
				}
			: { id: "close", text: "};" },
	);

	return lines;
}

export function ConfigAsCodeSimulator() {
	const { applied, reset } = useConfigSim();
	const reduce = useReducedMotion();
	const codeLines = buildCodeLines(applied);

	return (
		<div className="not-prose my-8 overflow-hidden rounded-xl border border-[#292929] bg-[#0F0F0F]">
			{/* Toolbar: filename + reset on the left, change toggles pinned right */}
			<div className="flex flex-wrap items-center gap-2 border-b border-[#292929] px-4 py-2.5 text-[13px]">
				<span className="font-mono text-[12px] text-[#FFFFFF4d]">plans.ts</span>
				<AnimatePresence>
					{applied.size > 0 && (
						<motion.button
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={ENTER}
							type="button"
							onClick={reset}
							className="font-mono text-[12px] text-[#FFFFFF66] transition-colors duration-200 hover:text-white"
						>
							Reset
						</motion.button>
					)}
				</AnimatePresence>
				<div className="ml-auto flex items-center gap-2">
					<Toggle change="version">Version Pro</Toggle>
				</div>
			</div>

			{/* Forking code — height reserved for the fullest state so toggling
			    never resizes the card (no overflow / scrollbars). */}
			<pre className="m-0 min-h-[178px] w-full overflow-hidden px-4 py-3.5 font-mono text-[12.5px] leading-[1.7]">
				<AnimatePresence initial={false} mode="popLayout">
					{codeLines.map((line) =>
						line.blank ? (
							<div key={line.id} aria-hidden className="h-[0.85em]" />
						) : (
							<motion.div
								key={line.id}
								layout
								initial={
									line.isNew && !reduce ? { opacity: 0, x: -6 } : { opacity: 0 }
								}
								animate={{ opacity: 1, x: 0 }}
								exit={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
								transition={{ ...ENTER, layout: LAYOUT }}
								className={cn(
									"-mx-2 rounded px-2",
									line.isNew && "bg-[#9564ff14]",
									line.text.startsWith("//")
										? "text-[#FFFFFF4d]"
										: "text-[#E5E5E5]",
								)}
							>
								{line.text}
								{line.comment ? (
									<span className="text-[#FFFFFF4d]">{line.comment}</span>
								) : null}
							</motion.div>
						),
					)}
				</AnimatePresence>
			</pre>
		</div>
	);
}
