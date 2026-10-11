const sharedWork = [
	{ id: "deduction-1", deduction: true },
	{ id: "background-1", deduction: false },
	{ id: "deduction-2", deduction: true },
	{ id: "background-2", deduction: false },
	{ id: "deduction-3", deduction: true },
	{ id: "background-3", deduction: false },
];

export function BalanceWorkerCores() {
	return (
		<figure
			className="not-prose @container mx-auto my-8 w-full min-w-0 max-w-2xl"
			aria-label="Before: deductions and background work share one core. After: core 1 processes deductions while core 2 handles garbage collection and background work. Measured peak throughput per worker increased to roughly 1.8 times the previous throughput."
		>
			<div className="grid gap-5 @[520px]:grid-cols-2">
				<div>
					<div className="mb-3 flex items-baseline justify-between text-xs">
						<span className="font-mono text-[#a3a3a3]">BEFORE</span>
						<span className="text-[#737373]">1 core per worker</span>
					</div>
					<div className="flex min-h-[180px] flex-col justify-center rounded-lg border border-[#525252] bg-[#141414] p-4">
						<CoreLane
							core="Core 1"
							description="Sharing CPU time"
							work={sharedWork}
						/>
					</div>
				</div>
				<div>
					<div className="mb-3 flex items-baseline justify-between text-xs">
						<span className="font-mono text-[#b08aff]">AFTER</span>
						<span className="text-[#737373]">2 cores per worker</span>
					</div>
					<div className="flex min-h-[180px] flex-col justify-center gap-5 rounded-lg border border-[#9564ff80] bg-[#141414] p-4">
						<CoreLane
							core="Core 1"
							description="Deductions"
							work={sharedWork.map(({ id }) => ({ id, deduction: true }))}
						/>
						<CoreLane
							core="Core 2"
							description="GC + background work"
							work={sharedWork.map(({ id }) => ({ id, deduction: false }))}
						/>
					</div>
				</div>
			</div>
			<div
				className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-[#a3a3a3]"
				aria-hidden="true"
			>
				<span className="flex items-center gap-2">
					<span className="size-2.5 rounded-sm bg-[#9564ff]" />
					Deductions
				</span>
				<span className="flex items-center gap-2">
					<span className="size-2.5 rounded-sm bg-[#737373]" />
					Background work
				</span>
			</div>
			<figcaption className="mt-5 text-center text-sm text-[#d4d4d4]">
				<span className="font-medium text-[#b08aff]">~1.8×</span> peak
				throughput per worker
			</figcaption>
		</figure>
	);
}

function CoreLane({
	core,
	description,
	work,
}: {
	core: string;
	description: string;
	work: { id: string; deduction: boolean }[];
}) {
	return (
		<div>
			<div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
				<span className="text-[#e5e5e5]">{core}</span>
				<span className="text-[#a3a3a3]">{description}</span>
			</div>
			<div className="grid grid-cols-6 gap-1.5" aria-hidden="true">
				{work.map(({ id, deduction }) => (
					<div
						key={id}
						className={`h-7 rounded-sm border ${deduction ? "border-[#a37aff] bg-[#9564ff70]" : "border-[#737373] bg-[#52525280]"}`}
					/>
				))}
			</div>
		</div>
	);
}
