const experiments = [
	{
		idea: "Choose faster processors",
		result: "Roughly halved CPU time per request at 3× traffic",
		shipped: true,
	},
	{
		idea: "Give each worker a second CPU core",
		result: "Peak throughput doubled",
		shipped: true,
	},
	{
		idea: "Stop tracing every request",
		result: "CPU usage fell 9–14% on older processors",
		shipped: true,
	},
	{
		idea: "Send larger batches to Kafka",
		result: "Shorter queue waits, but no CPU improvement",
		shipped: true,
	},
	{
		idea: "Move supporting work off the deduction thread",
		result: "Faster deductions and fewer errors, but 30% more CPU per request",
		shipped: true,
	},
	{
		idea: "Share API-key verification across simultaneous requests",
		result: "Eliminated client timeouts in the 4× load test",
		shipped: true,
	},
	{
		idea: "Combine database writes into one round trip",
		result: "Database flush time fell from 51 to 27 ms",
		shipped: true,
	},
	{
		idea: "Cache balance-check results",
		result: "Reused 76% of answers; CPU stayed flat on older processors",
		shipped: false,
	},
	{
		idea: "Reuse work between consecutive deductions",
		result: "CPU usage fell 8%",
		shipped: false,
	},
	{
		idea: "Use simpler arithmetic and smaller responses",
		result: "No clear improvement beyond test noise",
		shipped: false,
	},
	{
		idea: "Batch deductions and simplify request handling",
		result: "Helped on newer processors, hurt on older ones",
		shipped: false,
	},
	{
		idea: "Build customer state once",
		result: "Inconsistent results: two runs disagreed",
		shipped: false,
	},
	{
		idea: "Fix context reuse and restore limit alerts",
		result: "Fixed alerts, but CPU usage rose 7%",
		shipped: false,
	},
	{
		idea: "Reject requests that were already too late",
		result: "More checks defaulted to allowed on failure",
		shipped: false,
	},
	{
		idea: "Let API servers answer balance checks directly",
		result: "No CPU savings; overloaded Redis at 3× traffic",
		shipped: false,
	},
	{
		idea: "Remove Kafka’s wait when traffic is low",
		result: "Helped at low load in local tests, but not at full load",
		shipped: false,
	},
	{
		idea: "Reduce memory churn in the deduction thread",
		result: "Small gain in local benchmarks",
		shipped: false,
	},
	{
		idea: "Reduce memory allocations in deduction code",
		result: "Small gain in local benchmarks",
		shipped: false,
	},
	{
		idea: "Run more server processes per machine",
		result: "No quantified gain in local benchmarks",
		shipped: false,
	},
];

export function ExperimentResultsTable() {
	return (
		<div className="not-prose @container mx-auto my-6 w-full min-w-0 max-w-2xl">
			<div className="rounded-md border border-[#292929] bg-[#111111]">
				<table className="hidden w-full table-fixed border-separate border-spacing-0 text-left text-xs leading-[18px] @[520px]:table">
					<caption className="sr-only">
						All 19 experiments and their results; seven shipped
					</caption>
					<thead>
						<tr>
							<th
								scope="col"
								className="w-[43%] rounded-tl-md border-b border-[#292929] bg-[#191919] px-3 py-2 font-medium text-[#ededed]"
							>
								What we tried
							</th>
							<th
								scope="col"
								className="border-b border-[#292929] bg-[#191919] px-3 py-2 font-medium text-[#ededed]"
							>
								Main result
							</th>
							<th
								scope="col"
								className="w-16 rounded-tr-md border-b border-[#292929] bg-[#191919] px-2 py-2 text-center font-medium text-[#ededed]"
							>
								Shipped
							</th>
						</tr>
					</thead>
					<tbody>
						{experiments.map(({ idea, result, shipped }) => (
							<tr
								key={idea}
								className="[&:last-child>th]:border-b-0 [&:last-child>td]:border-b-0"
							>
								<th
									scope="row"
									className="border-b border-[#252525] px-3 py-2 align-top font-normal text-[#e5e5e5]"
								>
									{idea}
								</th>
								<td className="border-b border-[#252525] px-3 py-2 align-top text-[#a3a3a3]">
									{result}
								</td>
								<td className="border-b border-[#252525] px-2 py-2 text-center align-top">
									<ShippedStatus shipped={shipped} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
				<dl
					aria-label="All 19 experiments and their results; seven shipped"
					className="divide-y divide-[#252525] text-[13px] leading-5 @[520px]:hidden"
				>
					{experiments.map(({ idea, result, shipped }) => (
						<div key={idea} className="px-3 py-3">
							<dt className="flex items-start justify-between gap-3 font-medium text-[#e5e5e5]">
								<span>{idea}</span>
								<ShippedStatus shipped={shipped} />
							</dt>
							<dd className="mt-1 text-[#a3a3a3]">{result}</dd>
						</div>
					))}
				</dl>
			</div>
		</div>
	);
}

function ShippedStatus({ shipped }: { shipped: boolean }) {
	return (
		<span
			className={`shrink-0 ${shipped ? "text-[#b08aff]" : "text-[#737373]"}`}
		>
			<span aria-hidden="true">{shipped ? "✓" : "—"}</span>
			<span className="sr-only">{shipped ? "Shipped" : "Not shipped"}</span>
		</span>
	);
}
