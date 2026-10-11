const results = [
	{
		idea: "Reject requests that were already too late",
		outcome: "Made things worse: CPU usage increased 11%",
	},
	{
		idea: "Build customer state once instead of repeatedly",
		outcome: "Inconclusive: two runs disagreed",
	},
	{
		idea: "Reuse balance-check answers until the balance changes",
		outcome: "CPU fell 23% in one test, but stayed flat in another",
	},
	{
		idea: "Reuse lookups between consecutive deductions",
		outcome: "CPU per request fell 8–11%",
	},
	{
		idea: "Send more records together to Kafka",
		outcome: "Shorter queue waits, but no CPU improvement",
	},
	{
		idea: "Remove expensive libraries like Zod and Decimal.js",
		outcome:
			"Decimal.js + smaller replies: no clear improvement beyond test noise",
	},
];

export function LoadTestResultsTable() {
	return (
		<div className="not-prose @container mx-auto my-6 w-full min-w-0 max-w-2xl rounded-md border border-[#292929] bg-[#111111]">
			<table className="hidden w-full table-fixed border-separate border-spacing-0 text-left text-xs leading-[18px] @[520px]:table">
				<caption className="sr-only">
					CPU optimization load test results
				</caption>
				<thead>
					<tr>
						<th
							scope="col"
							className="w-[46%] rounded-tl-md border-b border-[#292929] bg-[#191919] px-3 py-2 font-medium text-[#ededed]"
						>
							What we tried
						</th>
						<th
							scope="col"
							className="rounded-tr-md border-b border-[#292929] bg-[#191919] px-3 py-2 font-medium text-[#ededed]"
						>
							What happened in load tests
						</th>
					</tr>
				</thead>
				<tbody>
					{results.map(({ idea, outcome }) => (
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
								{outcome}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<dl
				aria-label="CPU optimization load test results"
				className="divide-y divide-[#252525] text-[13px] leading-5 @[520px]:hidden"
			>
				{results.map(({ idea, outcome }) => (
					<div key={idea} className="px-3 py-2">
						<dt className="font-medium text-[#e5e5e5]">{idea}</dt>
						<dd className="mt-1.5 text-[#a3a3a3]">{outcome}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
