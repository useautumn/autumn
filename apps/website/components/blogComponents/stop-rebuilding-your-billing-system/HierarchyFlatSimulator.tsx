"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
	CountSelector,
	formatCount,
	formatMs,
	RunPill,
	SectionLabel,
	useUpdateRun,
} from "./hierarchyShared";
import { EASE_OUT } from "./shared";

const PER_ROW_MS = 12;
const WINDOW = 5;

export function HierarchyFlatSimulator() {
	const [count, setCount] = useState(10);
	const { status, rowsDone, elapsedMs, projectedMs, start, reset } =
		useUpdateRun({ rows: count, perRowMs: PER_ROW_MS });

	const running = status === "running";

	// Scrolling window of customer rows: ids stream past as each is written.
	const windowSize = Math.min(count, WINDOW);
	const lastId =
		status === "idle"
			? windowSize
			: Math.min(Math.max(rowsDone, windowSize), count);
	const topId = Math.max(1, lastId - windowSize + 1);
	const pad = Math.max(2, String(count).length);
	const ids = Array.from({ length: windowSize }, (_, k) => topId + k);

	const pickCount = (n: number) => {
		reset();
		setCount(n);
	};

	return (
		<div className="not-prose my-8 overflow-hidden rounded-xl border border-[#292929] bg-[#0F0F0F]">
			<div className="flex flex-wrap items-center gap-2 border-b border-[#292929] px-4 py-2.5">
				<CountSelector value={count} onSelect={pickCount} disabled={running} />
				<div className="ml-auto flex items-center gap-2">
					{status !== "idle" && (
						<button
							type="button"
							onClick={reset}
							className="font-mono text-[12px] text-[#FFFFFF66] transition-colors duration-200 hover:text-white"
						>
							Reset
						</button>
					)}
					<RunPill onClick={start} disabled={running}>
						Raise Pro → 200
					</RunPill>
				</div>
			</div>

			<div className="min-h-[340px] overflow-hidden">
				<SectionLabel className="border-b border-[#292929]">
					customers
				</SectionLabel>
				<table className="w-full table-fixed font-mono text-[12px] leading-[1.7]">
					<thead>
						<tr className="text-[#FFFFFF66]">
							<th className="w-[40%] px-4 py-1.5 text-left font-normal">id</th>
							<th className="w-[28%] px-4 py-1.5 text-left font-normal">
								plan
							</th>
							<th className="w-[32%] px-4 py-1.5 text-left font-normal">
								credits
							</th>
						</tr>
					</thead>
					<tbody>
						{ids.map((id) => {
							const raised = id <= rowsDone;
							const current = running && id === rowsDone;
							return (
								<tr
									key={id}
									className={cn(
										"border-t border-[#1f1f1f] transition-colors duration-150",
										current && "bg-[#9564ff14]",
									)}
								>
									<td className="px-4 py-1.5 text-[#E5E5E5]">
										cus_{String(id).padStart(pad, "0")}
									</td>
									<td className="px-4 py-1.5 text-[#FFFFFF99]">pro</td>
									<td
										className={cn(
											"px-4 py-1.5 transition-colors duration-150",
											raised ? "text-[#9564ff]" : "text-[#E5E5E5]",
										)}
									>
										{raised ? 200 : 100}
									</td>
								</tr>
							);
						})}

						<tr className="border-t border-[#292929]">
							<td className="px-4 py-1.5 text-[#E5E5E5]">acme</td>
							<td className="px-4 py-1.5 text-[#FFFFFF99]">pro</td>
							<td className="px-4 py-1.5">
								<span className="text-[#ff9d4d]">500</span>
								<span className="text-[#FFFFFF4d]"> custom</span>
							</td>
						</tr>
					</tbody>
				</table>

				<div className="border-t border-[#292929] px-4 py-3">
					<div className="h-1 w-full overflow-hidden rounded-full bg-[#1c1c1c]">
						<motion.div
							className="h-full rounded-full bg-[#9564ff]"
							animate={{ width: `${(rowsDone / count) * 100}%` }}
							transition={{ duration: 0.1, ease: EASE_OUT }}
						/>
					</div>
					<div className="mt-2 font-mono text-[12px]">
						{status === "idle" && (
							<span className="text-[#FFFFFF66]">
								{formatCount(count)} rows on pro
							</span>
						)}
						{running && (
							<span className="text-[#FFFFFF99]">
								{formatCount(rowsDone)} / {formatCount(count)} ·{" "}
								{formatMs(elapsedMs)}
							</span>
						)}
						{status === "done" && (
							<span className="text-[#ff6b6b]">
								{formatCount(count)} writes · {formatMs(projectedMs)}
							</span>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
