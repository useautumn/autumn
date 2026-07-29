import type { ReactNode } from "react";

function BeforeChip({
	children,
	dashed,
}: {
	children: string;
	dashed?: boolean;
}) {
	return (
		<div
			className={`rounded-md px-[9px] py-[7px] font-mono text-[10px] text-[#FFFFFF99] ${
				dashed
					? "border border-dashed border-[#3a3a3a]"
					: "border border-[#292929] bg-[#141414]"
			}`}
		>
			{children}
		</div>
	);
}

function ValueRow({ value, label }: { value: string; label: string }) {
	return (
		<div className="font-mono text-[11px] text-[#E5E5E5]">
			{value} <span className="text-[#FFFFFF66]">{label}</span>
		</div>
	);
}

function PlanColumn({
	title,
	accent,
	children,
}: {
	title: string;
	accent?: boolean;
	children: ReactNode;
}) {
	return (
		<div
			className={`rounded-lg border p-[11px] ${
				accent
					? "border-[#9564ff4d] bg-[#9564ff14]"
					: "border-[#292929] bg-[#141414]"
			}`}
		>
			<div className="mb-2 text-[12px] text-[#E5E5E5]">{title}</div>
			<div className="flex flex-col gap-1">{children}</div>
		</div>
	);
}

export function PlanRecordDiagram() {
	return (
		<div className="not-prose my-8 flex flex-col items-stretch gap-3.5 sm:flex-row">
			<div className="flex flex-none flex-row flex-wrap items-center gap-1.5 opacity-[0.55] sm:w-[112px] sm:flex-col sm:justify-center">
				<div className="w-full font-mono text-[9px] text-[#FFFFFF4d] uppercase tracking-widest">
					before
				</div>
				<BeforeChip>stripe</BeforeChip>
				<BeforeChip dashed>salesforce</BeforeChip>
				<BeforeChip>internal db</BeforeChip>
			</div>

			<div className="flex flex-none items-center justify-center font-mono text-[14px] text-[#3f3f3f] sm:w-[22px]">
				<span className="rotate-90 sm:rotate-0">→</span>
			</div>

			<div className="min-w-0 flex-1 rounded-[10px] border border-[#292929] bg-[#0F0F0F] p-3.5">
				<div className="mb-3 flex items-baseline justify-between gap-2">
					<span className="font-mono text-[11px] text-[#E5E5E5]">
						plan record
					</span>
					<span className="font-mono text-[10px] text-[#FFFFFF4d]">
						acme docs · enterprise
					</span>
				</div>

				<div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
					<PlanColumn title="Charged">
						<ValueRow label="/ mo" value="$2,500" />
						<ValueRow label="/ credit over" value="$0.02" />
						<div className="font-mono text-[11px] text-[#FFFFFF66]">
							no seat price
						</div>
					</PlanColumn>
					<PlanColumn title="Get">
						<ValueRow label="ai credits" value="100k" />
						<ValueRow label="deployments" value="3" />
						<ValueRow label="editor seats" value="∞" />
					</PlanColumn>
					<PlanColumn accent title="When">
						<ValueRow label="pilot" value="30d" />
						<ValueRow label="ramp" value="m3" />
						<ValueRow label="term" value="12mo" />
					</PlanColumn>
				</div>
			</div>
		</div>
	);
}
