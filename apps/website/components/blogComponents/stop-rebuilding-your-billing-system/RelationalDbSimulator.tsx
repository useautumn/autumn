"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import {
	type ChangeId,
	CUSTOMER_ROWS,
	ENTER,
	LAYOUT,
	PLAN_ROWS,
	TogglePill,
	useApplied,
} from "./shared";

const CHANGES: { id: ChangeId; label: string }[] = [
	{ id: "version", label: "Version Pro" },
	{ id: "custom", label: "Custom contract" },
];

const sectionLabel =
	"bg-[#141414] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[#9564ff]";

export function RelationalDbSimulator() {
	const { applied, toggle, reset } = useApplied();
	const reduce = useReducedMotion();

	const visiblePlans = PLAN_ROWS.filter(
		(row) => !row.requires || applied.has(row.requires),
	);

	return (
		<div className="not-prose my-8 overflow-hidden rounded-xl border border-[#292929] bg-[#0F0F0F]">
			{/* Toolbar: db name + reset on the left, change toggles pinned right */}
			<div className="flex flex-wrap items-center gap-2 border-b border-[#292929] px-4 py-2.5 text-[13px]">
				<span className="font-mono text-[12px] text-[#FFFFFF4d]">postgres</span>
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
				<div className="ml-auto flex flex-wrap items-center gap-2">
					{CHANGES.map((change) => (
						<TogglePill
							key={change.id}
							active={applied.has(change.id)}
							onClick={() => toggle(change.id)}
						>
							{change.label}
						</TogglePill>
					))}
				</div>
			</div>

			{/* Tables flush to the card edges; height reserved for the fullest
			    state so toggling never resizes the card (no scrollbars). */}
			<div className="min-h-[420px] overflow-hidden">
				{/* PLANS */}
				<div className={cn("border-b border-[#292929]", sectionLabel)}>
					plans
				</div>
				<table className="w-full table-fixed font-mono text-[12px] leading-[1.7]">
					<thead>
						<tr className="text-[#FFFFFF66]">
							<th className="w-[30%] px-4 py-1.5 text-left font-normal">id</th>
							<th className="w-[24%] px-4 py-1.5 text-left font-normal">
								type
							</th>
							<th className="w-[18%] px-4 py-1.5 text-left font-normal">
								price
							</th>
							<th className="w-[28%] px-4 py-1.5 text-left font-normal">
								credits
							</th>
						</tr>
					</thead>
					<tbody>
						<AnimatePresence initial={false}>
							{visiblePlans.map((row) => (
								<motion.tr
									key={row.id}
									layout
									initial={
										row.requires && !reduce
											? { opacity: 0, y: -6 }
											: { opacity: 0 }
									}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0 }}
									transition={{ ...ENTER, layout: LAYOUT }}
									className={cn(
										"border-t border-[#1f1f1f]",
										row.requires && "bg-[#9564ff12]",
									)}
								>
									<td className="px-4 py-1.5 text-[#E5E5E5]">{row.id}</td>
									<td className="px-4 py-1.5 text-[#FFFFFF99]">{row.type}</td>
									<td className="px-4 py-1.5 text-[#E5E5E5]">{row.price}</td>
									<td className="px-4 py-1.5 text-[#E5E5E5]">{row.credits}</td>
								</motion.tr>
							))}
						</AnimatePresence>
					</tbody>
				</table>

				{/* CUSTOMERS + the single join query */}
				<div className={cn("border-y border-[#292929]", sectionLabel)}>
					customers
				</div>
				<table className="w-full table-fixed font-mono text-[12px] leading-[1.7]">
					<thead>
						<tr className="text-[#FFFFFF66]">
							<th className="w-[18%] px-4 py-1.5 text-left font-normal">id</th>
							<th className="w-[40%] px-4 py-1.5 text-left font-normal">
								email
							</th>
							<th className="w-[42%] px-4 py-1.5 text-left font-normal">
								plan_id →
							</th>
						</tr>
					</thead>
					<tbody>
						{CUSTOMER_ROWS.map((row) => {
							const resolved = visiblePlans.some(
								(plan) => plan.id === row.planId,
							);
							return (
								<tr key={row.id} className="border-t border-[#1f1f1f]">
									<td className="px-4 py-1.5 text-[#E5E5E5]">{row.id}</td>
									<td className="px-4 py-1.5 text-[#FFFFFF99]">{row.email}</td>
									<td
										className={cn(
											"px-4 py-1.5 transition-colors duration-200",
											resolved ? "text-[#9564ff]" : "text-[#ff6b6b]",
										)}
									>
										{row.planId}
										{resolved ? "" : " (missing)"}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>

				<div className="border-t border-[#1f1f1f] px-4 py-3 font-mono text-[11.5px] leading-[1.7]">
					<div className="text-[#FFFFFF4d]">
						-- fetch any customer with their plan in one query
					</div>
					<div className="text-[#E5E5E5]">select * from customers c</div>
					<div className="text-[#E5E5E5]">
						{"  "}join plans p on p.id = c.plan_id;
					</div>
				</div>
			</div>
		</div>
	);
}
