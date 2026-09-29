import type { ReactNode } from "react";

const DAYS_IN_MONTH = 30;
const FREE_CAP_DAY = 10;

function DayBars({ filledDays }: { filledDays: number }) {
	return (
		<div className="flex gap-[2px] sm:gap-1">
			{Array.from({ length: DAYS_IN_MONTH }, (_, index) => {
				const filled = index < filledDays;
				return (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length day strip
						key={index}
						className={`h-12 flex-1 rounded-[2px] sm:h-14 ${
							filled ? "bg-[#9564ff]" : "border border-[#333333] border-dashed"
						}`}
					/>
				);
			})}
		</div>
	);
}

function PlanRow({
	name,
	price,
	labelOffset = "sm:pt-[18px]",
	children,
}: {
	name: string;
	price: string;
	labelOffset?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
			<div
				className={`flex flex-none items-baseline gap-2 sm:w-[120px] sm:flex-col sm:gap-1 ${labelOffset}`}
			>
				<span className="font-mono text-[13px] text-[#E5E5E5]">{name}</span>
				<span className="font-mono text-[10px] text-[#FFFFFF66]">{price}</span>
			</div>
			<div className="relative flex min-w-0 flex-1 flex-col gap-2">
				{children}
			</div>
		</div>
	);
}

function Note({ children }: { children: string }) {
	return (
		<span className="font-mono text-[10px] text-[#FFFFFF66]">{children}</span>
	);
}

export function DailyCreditsDiagram() {
	return (
		<div className="not-prose my-8 flex justify-center">
			<div className="flex w-full max-w-[688px] flex-col gap-8">
				<PlanRow name="Free" price="$0" labelOffset="sm:pt-[46px]">
					<div className="relative pt-7">
						{/* sits in the gap after day 10: one third of the strip, minus a sixth of a gap */}
						<div className="absolute top-1.5 bottom-[-6px] left-[calc(33.333%-1px)] w-px bg-[#E5E5E5]" />
						<span className="absolute top-0 left-[calc(33.333%+7px)] whitespace-nowrap font-mono text-[10px] text-[#E5E5E5]">
							15,000 cap reached · day 10
						</span>
						<DayBars filledDays={FREE_CAP_DAY} />
					</div>
					<Note>
						No monthly allowance. Daily credits pause until next month.
					</Note>
				</PlanRow>

				<PlanRow name="Pro" price="$20 / mo">
					<DayBars filledDays={DAYS_IN_MONTH} />
					<div className="flex h-10 items-center justify-between rounded border border-[#2e2e2e] bg-[#191919] px-3 font-mono text-[11px] text-[#E5E5E5]">
						<span>Monthly allowance</span>
						<span>25,000</span>
					</div>
					<Note>
						No cap. Daily credits come on top of the monthly allowance.
					</Note>
				</PlanRow>

				<div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10px] sm:pl-[144px]">
					<div className="flex items-center gap-2">
						<div className="size-2.5 rounded-[2px] bg-[#9564ff]" />
						<span className="text-[#FFFFFF99]">
							1 day = 1,500 daily credits
						</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="size-2.5 rounded-[2px] border border-[#555555] border-dashed" />
						<span className="text-[#FFFFFF99]">used daily credits</span>
					</div>
					<span className="text-[#FFFFFF4d]">day 1 → day 30</span>
				</div>
			</div>
		</div>
	);
}
