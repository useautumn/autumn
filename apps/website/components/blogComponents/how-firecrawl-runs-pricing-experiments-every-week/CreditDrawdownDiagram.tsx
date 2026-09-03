import type { ReactNode } from "react";

function EventCard({ endpoint }: { endpoint: string }) {
	return (
		<div className="flex flex-col gap-[5px] rounded-lg border border-[#2e2e2e] bg-[#191919] px-[11px] py-[10px]">
			<span className="font-mono text-[11px] text-[#E5E5E5]">{endpoint}</span>
			<span className="font-mono text-[10px] text-[#FFFFFF66]">1 credit</span>
		</div>
	);
}

function StepLabel({
	step,
	accent,
	children,
}: {
	step: string;
	accent?: boolean;
	children: string;
}) {
	return (
		<div className="absolute top-[13px] left-[calc(25%+10px)] flex items-center gap-[7px]">
			<span
				className={`flex size-[15px] items-center justify-center rounded-full border font-mono text-[9px] leading-none ${
					accent
						? "border-[#9564ff66] text-[#9564ff]"
						: "border-[#3a3a3a] text-[#FFFFFF99]"
				}`}
			>
				{step}
			</span>
			<span
				className={`whitespace-nowrap font-mono text-[10px] ${
					accent ? "text-[#9564ffcc]" : "text-[#FFFFFF99]"
				}`}
			>
				{children}
			</span>
		</div>
	);
}

function ArrowHead({ className }: { className: string }) {
	return (
		<div
			className={`absolute size-0 border-x-[4.5px] border-t-[6px] border-x-transparent ${className}`}
		/>
	);
}

function BalanceCard({
	title,
	amount,
	accent,
	children,
}: {
	title: string;
	amount: string;
	accent?: boolean;
	children: ReactNode;
}) {
	return (
		<div
			className={`overflow-hidden rounded-lg border ${
				accent
					? "border-[#9564ff59] bg-[#9564ff1a]"
					: "border-[#2e2e2e] bg-[#191919]"
			}`}
		>
			<div
				className={`flex items-baseline justify-between gap-2 border-b px-[11px] py-[9px] ${
					accent ? "border-[#9564ff33]" : "border-[#2e2e2e]"
				}`}
			>
				<span className="font-mono text-[11px] text-[#E5E5E5]">{title}</span>
				<span
					className={`font-mono text-[11px] ${accent ? "text-[#9564ff]" : "text-[#E5E5E5]"}`}
				>
					{amount}
				</span>
			</div>
			<div className="flex flex-col gap-[5px] px-[11px] py-[9px]">
				{children}
			</div>
		</div>
	);
}

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between gap-2.5 font-mono text-[10px]">
			<span className="text-[#FFFFFF66]">{label}</span>
			<span className="text-right text-[#E5E5E5]">{value}</span>
		</div>
	);
}

export function CreditDrawdownDiagram() {
	return (
		<div className="not-prose my-8 flex justify-center">
			<div className="w-full max-w-[688px]">
				<div className="mb-2 font-mono text-[9px] text-[#FFFFFF4d] uppercase tracking-widest">
					reported event
				</div>

				<div className="grid grid-cols-2 gap-3">
					<EventCard endpoint="POST /v1/search" />
					<EventCard endpoint="POST /v1/scrape" />
				</div>

				{/* search → search credits (solid); scrape → bypasses down the right edge (dashed) */}
				<div className="relative h-[46px]">
					<div className="absolute top-0 left-[calc(25%-3px)] h-[46px] w-[1.5px] bg-[#9564ff66]" />
					<ArrowHead className="top-[40px] left-[calc(25%-7px)] border-t-[#9564ff99]" />
					<StepLabel accent step="1">
						drawn first
					</StepLabel>

					<div className="absolute top-0 left-[calc(75%-3px)] h-[23px] w-[1.5px] bg-[#3a3a3a]" />
					<div className="absolute top-[22px] right-[7px] left-[calc(75%-3px)] h-0 border-t-[1.5px] border-dashed border-[#454545]" />
					<div className="absolute top-[22px] right-[7px] h-6 w-0 border-l-[1.5px] border-dashed border-[#454545]" />
					<div className="absolute top-[30px] right-[22px] whitespace-nowrap text-right font-mono text-[10px] text-[#FFFFFF66]">
						bypasses
					</div>
				</div>

				<div className="relative pr-[26px]">
					<div className="absolute top-0 right-[7px] bottom-0 w-0 border-l-[1.5px] border-dashed border-[#454545]" />
					<BalanceCard accent amount="500" title="search credits">
						<DetailRow label="scope" value="/v1/search only" />
						<DetailRow label="source" value="promo grant" />
						<div className="font-mono text-[10px] text-[#FFFFFF59]">
							✗ /v1/scrape can't draw here
						</div>
					</BalanceCard>
				</div>

				{/* both paths land on plan credits */}
				<div className="relative h-[46px]">
					<div className="absolute top-0 left-[calc(25%-3px)] h-[46px] w-0 border-l-[1.5px] border-dashed border-[#454545]" />
					<ArrowHead className="top-[40px] left-[calc(25%-7px)] border-t-[#555555]" />
					<StepLabel step="2">falls back at 0</StepLabel>

					<div className="absolute top-0 right-[7px] h-[46px] w-0 border-l-[1.5px] border-dashed border-[#454545]" />
					<ArrowHead className="top-[40px] right-[3px] border-t-[#555555]" />
				</div>

				<BalanceCard amount="3,000" title="plan credits">
					<DetailRow label="scope" value="all endpoints" />
					<DetailRow label="source" value="subscription" />
				</BalanceCard>
			</div>
		</div>
	);
}
