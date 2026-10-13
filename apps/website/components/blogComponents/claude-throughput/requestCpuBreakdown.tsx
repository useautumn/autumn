export function RequestCpuBreakdown() {
	return (
		<figure
			className="not-prose @container mx-auto my-8 w-full min-w-0 max-w-2xl"
			aria-label="Measured CPU cost per request: plumbing 557 microseconds, deduction logic 349 microseconds, and commit work 313 microseconds. Total 1,219 microseconds. Deduction logic accounted for about 29 percent. Segment widths represent CPU cost, not elapsed execution order."
		>
			<div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
				<span className="text-sm font-medium text-[#e5e5e5]">
					CPU cost per request
				</span>
				<span className="font-mono text-xs tabular-nums text-[#a3a3a3]">
					1,219 µs total
				</span>
			</div>
			<div
				className="mb-3 flex items-center gap-3 text-xs text-[#a3a3a3]"
				aria-hidden="true"
			>
				<span>Request arrives</span>
				<svg
					className="h-3 min-w-0 flex-1"
					viewBox="0 0 100 12"
					preserveAspectRatio="none"
				>
					<path
						d="M 0 6 L 99 6 M 96 2 L 99 6 L 96 10"
						fill="none"
						stroke="#737373"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
				<span>Done</span>
			</div>
			<div className="grid grid-cols-[557fr_349fr_313fr]">
				<div className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-l-md border border-[#737373] bg-[#252525] px-1 py-3 @[480px]:py-5 text-center">
					<span className="text-xs text-[#d4d4d4] @[480px]:text-sm">
						Plumbing
					</span>
					<span className="font-mono text-xs tabular-nums text-[#a3a3a3] @[480px]:text-sm">
						557 µs
					</span>
				</div>
				<div className="flex min-w-0 flex-col items-center justify-center gap-1 border-y border-[#9564ff] bg-[#9564ff26] px-1 py-3 @[480px]:py-5 text-center">
					<span className="text-xs text-[#e5d9ff] @[480px]:text-sm">
						Deduction
					</span>
					<span className="font-mono text-xs tabular-nums text-[#c5aaff] @[480px]:text-sm">
						349 µs
					</span>
				</div>
				<div className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-r-md border border-[#737373] bg-[#303030] px-1 py-3 @[480px]:py-5 text-center">
					<span className="text-xs text-[#d4d4d4] @[480px]:text-sm">
						Commit
					</span>
					<span className="font-mono text-xs tabular-nums text-[#a3a3a3] @[480px]:text-sm">
						313 µs
					</span>
				</div>
				<div className="px-1 pt-3 text-center text-[11px] leading-4 text-[#a3a3a3] @[480px]:text-xs">
					HTTP · JSON · GC
					<br />
					Network / runtime
				</div>
				<div className="px-1 pt-3 text-center text-[11px] leading-4 text-[#c5aaff] @[480px]:text-xs">
					Business logic
				</div>
				<div className="px-1 pt-3 text-center text-[11px] leading-4 text-[#a3a3a3] @[480px]:text-xs">
					Kafka /<br />
					Postgres
				</div>
				<div
					className="col-start-2 flex flex-col items-center pt-2"
					aria-hidden="true"
				>
					<svg viewBox="0 0 12 25" className="h-6 w-3">
						<path
							d="M 6 24 L 6 2 M 1 8 L 6 2 L 11 8"
							fill="none"
							stroke="#9564ff"
							strokeWidth="1.4"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</div>
			</div>
			<p className="mt-2 text-center text-sm text-[#b08aff]">
				We were optimizing this 29%.
			</p>
		</figure>
	);
}
