const benchmarks = [
	{
		platform: "Fargate",
		chip: "Intel Cascade Lake",
		microseconds: 1216,
		value: "1,216 µs",
		highlight: false,
	},
	{
		platform: "Fargate",
		chip: "AMD Milan",
		microseconds: 775,
		value: "775 µs",
		highlight: false,
	},
	{
		platform: "Fargate",
		chip: "Intel Sapphire Rapids",
		microseconds: 733,
		value: "733 µs",
		highlight: false,
	},
	{
		platform: "EC2",
		chip: "AMD Genoa",
		microseconds: 556,
		value: "556 µs",
		highlight: true,
	},
];

export function CpuTimeByChip() {
	return (
		<figure
			className="not-prose mx-auto my-8 w-full min-w-0 max-w-2xl"
			aria-label="CPU time per request by chip. Lower is better. Fargate Intel Cascade Lake: 1,216 microseconds; Fargate AMD Milan: 775; Fargate Intel Sapphire Rapids: 733; EC2 AMD Genoa: 556."
		>
			<figcaption className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<span className="text-sm font-medium text-[#e5e5e5]">
					CPU time per request
				</span>
				<span className="text-xs text-[#a3a3a3]">Lower is better</span>
			</figcaption>
			<div className="space-y-5">
				{benchmarks.map(
					({ platform, chip, microseconds, value, highlight }) => (
						<div key={chip}>
							<div className="mb-2 flex items-baseline justify-between gap-3 text-xs leading-5 sm:text-sm">
								<span className="min-w-0 text-[#d4d4d4]">
									<span className="text-[#a3a3a3]">{platform} · </span>
									{chip}
								</span>
								<span
									className={`shrink-0 font-mono text-xs tabular-nums ${highlight ? "text-[#b08aff]" : "text-[#d4d4d4]"}`}
								>
									{value}
								</span>
							</div>
							<div
								className="h-6 border-l border-[#525252] bg-[#ffffff03]"
								aria-hidden="true"
							>
								<div
									className={`h-full rounded-r-sm border-y border-r ${highlight ? "border-[#a37aff] bg-[#9564ff]" : "border-[#737373] bg-[#525252]"}`}
									style={{ width: `${(microseconds / 1216) * 100}%` }}
								/>
							</div>
						</div>
					),
				)}
			</div>
		</figure>
	);
}
