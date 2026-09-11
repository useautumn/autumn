import { cn } from "@/lib/utils";

export function CloudAgentEvidence({
	time,
	stage,
}: {
	time: number;
	stage: number;
}) {
	if (stage === 0) {
		return (
			<div className="rounded-md border border-[#303030] bg-[#141414] p-3 font-mono text-[12px]">
				<div className="mb-2 text-[#777]">isolated workspace</div>
				<div className="flex flex-wrap gap-2">
					{["Postgres", "Cache", "Queues"].map((name) => (
						<span
							key={name}
							className={cn(
								"rounded border px-2 py-1",
								time >= 900
									? "border-[#44374f] text-[#c5b3d7]"
									: "border-[#292929] text-[#666]",
							)}
						>
							{name}
						</span>
					))}
				</div>
			</div>
		);
	}
	if (stage === 1) {
		return (
			<div className="rounded-md border border-[#303030] bg-[#141414] px-3 py-2 font-mono text-[12px] leading-6">
				<div className="text-[#999]">✓ Usage recorded</div>
				{time >= 6800 && <div className="text-[#999]">✓ Invoice created</div>}
				{time >= 8300 && (
					<div className="text-[#d4b486]">! Overage item missing</div>
				)}
			</div>
		);
	}
	if (stage === 2) {
		let result = "Writing regression test…";
		let color = "text-[#999]";
		if (time >= 11900) {
			result = "× Missing overage item · reproduced";
			color = "text-[#d79b9b]";
		}
		if (time >= 16200) {
			result = "✓ Overage item present · passed";
			color = "text-[#9ac8ac]";
		}
		return (
			<div className="overflow-hidden rounded-md border border-[#303030] bg-[#121212] font-mono text-[12px]">
				<div className="border-b border-[#292929] px-3 py-2 text-[#777]">
					overages.test.ts
				</div>
				<div className={cn("px-3 py-3", color)}>{result}</div>
				{time >= 14200 && (
					<div className="border-t border-[#292929] px-3 py-2 text-[#999]">
						invoice handler{" "}
						<span className="float-right text-[#9ac8ac]">edited</span>
					</div>
				)}
			</div>
		);
	}
	const completed = Math.min(24, Math.max(0, Math.floor((time - 18700) / 175)));
	return (
		<div className="rounded-md border border-[#303030] bg-[#121212] p-3 font-mono text-[12px]">
			<div className="flex justify-between text-[#999]">
				<span>bun tw · core + billing</span>
				<span>{completed}/24</span>
			</div>
			<div className="mt-3 grid grid-cols-12 gap-1" aria-hidden="true">
				{Array.from({ length: 24 }, (_, id) => `check-${id}`).map(
					(id, index) => (
						<span
							key={id}
							className={cn(
								"h-2 rounded-[1px]",
								index < completed ? "bg-[#8264b2]" : "bg-[#28232f]",
							)}
						/>
					),
				)}
			</div>
		</div>
	);
}
