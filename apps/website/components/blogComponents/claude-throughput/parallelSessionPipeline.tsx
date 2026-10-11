const stages = [
	{ label: "Prepare", color: "border-[#737373] bg-[#252525] text-[#e5e5e5]" },
	{
		label: "Load test",
		color: "border-[#9564ff] bg-[#9564ff26] text-[#c5aaff]",
	},
	{ label: "Analyze", color: "border-[#658980] bg-[#65898020] text-[#a9c9bf]" },
];

const sessions = [
	{ label: "Claude 1", start: 2 },
	{ label: "Claude 2", start: 3 },
	{ label: "Claude N", start: 5 },
];

export function ParallelSessionPipeline() {
	return (
		<figure
			className="not-prose @container my-6 min-w-0"
			aria-label="Schematic timeline of N Claude sessions. Preparation, load testing and analysis overlap across sessions, while load tests take turns using staging."
		>
			<div className="mb-4 flex items-center gap-2 pl-[68px] text-xs text-[#a3a3a3]">
				<span>Time</span>
				<svg
					viewBox="0 0 100 10"
					preserveAspectRatio="none"
					className="h-2 flex-1"
					aria-hidden="true"
				>
					<path
						d="M 0 5 L 99 5 M 96 1 L 99 5 L 96 9"
						fill="none"
						stroke="currentColor"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
			</div>
			<div className="space-y-3">
				{sessions.map(({ label, start }, index) => (
					<div key={label}>
						{index === 2 ? (
							<div
								aria-hidden="true"
								className="mb-3 pl-6 text-sm leading-3 text-[#737373]"
							>
								⋮
							</div>
						) : null}
						<div className="grid grid-cols-[64px_repeat(6,minmax(0,1fr))] items-center gap-1 @[480px]:gap-2">
							<span className="text-xs text-[#d4d4d4]">{label}</span>
							{stages.map(({ label: stage, color }, stageIndex) => (
								<div
									key={stage}
									style={{ gridColumn: start + stageIndex }}
									className={`flex h-10 min-w-0 items-center justify-center rounded border text-center text-xs ${color}`}
								>
									<span className="hidden @[480px]:inline">{stage}</span>
									<span className="@[480px]:hidden" aria-hidden="true">
										{stageIndex + 1}
									</span>
									<span className="sr-only @[480px]:hidden">{stage}</span>
								</div>
							))}
						</div>
					</div>
				))}
			</div>
			<div
				className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs @[480px]:hidden"
				aria-hidden="true"
			>
				{stages.map(({ label, color }, index) => (
					<div key={label} className="flex items-center gap-1.5 text-[#a3a3a3]">
						<span
							className={`flex size-5 items-center justify-center rounded border ${color}`}
						>
							{index + 1}
						</span>
						{label}
					</div>
				))}
			</div>
			<figcaption className="mt-4 text-xs leading-5 text-[#a3a3a3]">
				Load tests take turns on staging; preparation and analysis overlap.
			</figcaption>
		</figure>
	);
}
