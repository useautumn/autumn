"use client";

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

const PER_ROW_MS = 6;
const VISIBLE_INHERIT = 4;

export function HierarchyLayeredSimulator() {
	const [count, setCount] = useState(10);
	const { status, projectedMs, start, reset } = useUpdateRun({
		rows: 1,
		perRowMs: PER_ROW_MS,
	});

	const raised = status === "done";
	const planValue = raised ? 200 : 100;
	const running = status === "running";

	const visibleInherit = Math.min(count, VISIBLE_INHERIT);
	const hiddenInherit = Math.max(count - VISIBLE_INHERIT, 0);

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

			<div className="min-h-[396px] overflow-hidden">
				{/* PLANS — the single source of the default */}
				<SectionLabel className="border-b border-[#292929]">plans</SectionLabel>
				<table className="w-full table-fixed font-mono text-[12px] leading-[1.7]">
					<thead>
						<tr className="text-[#FFFFFF66]">
							<th className="w-[40%] px-4 py-1.5 text-left font-normal">id</th>
							<th className="w-[28%] px-4 py-1.5 text-left font-normal">
								plan
							</th>
							<th className="w-[32%] px-4 py-1.5 text-left font-normal">
								default_credits
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							className={cn(
								"border-t border-[#1f1f1f] transition-colors duration-200",
								raised && "bg-[#9564ff12]",
							)}
						>
							<td className="px-4 py-1.5 text-[#E5E5E5]">pro</td>
							<td className="px-4 py-1.5 text-[#FFFFFF99]">standard</td>
							<td
								className={cn(
									"px-4 py-1.5 transition-colors duration-200",
									raised ? "text-[#9564ff]" : "text-[#E5E5E5]",
								)}
							>
								{planValue}
							</td>
						</tr>
					</tbody>
				</table>

				{/* CUSTOMERS — inherit the plan default unless overridden */}
				<SectionLabel className="border-y border-[#292929]">
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
						{Array.from({ length: visibleInherit }, (_, i) => (
							<tr
								key={`inherit-${i + 1}`}
								className="border-t border-[#1f1f1f]"
							>
								<td className="px-4 py-1.5 text-[#E5E5E5]">
									cus_{String(i + 1).padStart(2, "0")}
								</td>
								<td className="px-4 py-1.5 text-[#FFFFFF99]">pro</td>
								<td className="px-4 py-1.5">
									<span
										className={cn(
											"transition-colors duration-200",
											raised ? "text-[#9564ff]" : "text-[#E5E5E5]",
										)}
									>
										{planValue}
									</span>
									<span className="text-[#FFFFFF4d]"> inherit</span>
								</td>
							</tr>
						))}

						{hiddenInherit > 0 && (
							<tr className="border-t border-[#1f1f1f]">
								<td className="px-4 py-1.5 text-[#FFFFFF4d]" colSpan={3}>
									… +{formatCount(hiddenInherit)} more inherit
								</td>
							</tr>
						)}

						<tr className="border-t border-[#1f1f1f]">
							<td className="px-4 py-1.5 text-[#E5E5E5]">acme</td>
							<td className="px-4 py-1.5 text-[#FFFFFF99]">pro</td>
							<td className="px-4 py-1.5">
								<span className="text-[#ff9d4d]">500</span>
								<span className="text-[#FFFFFF4d]"> custom</span>
							</td>
						</tr>
					</tbody>
				</table>

				<div className="border-t border-[#292929] px-4 py-3 font-mono text-[12px]">
					{status === "idle" && (
						<span className="text-[#FFFFFF66]">1 plan row</span>
					)}
					{running && <span className="text-[#FFFFFF99]">writing…</span>}
					{raised && (
						<span className="text-[#9564ff]">
							1 write · {formatMs(projectedMs)}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
