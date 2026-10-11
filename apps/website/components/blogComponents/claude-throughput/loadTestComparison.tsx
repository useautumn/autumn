import { ExperimentationLoop } from "./experimentationLoop";

const steps = [
	{
		label: "Hypothesis",
		detail: ["Opening connections", "stalled Postgres"],
	},
	{
		label: "Experiment",
		detail: ["Set minimum pool size;", "test with and without"],
	},
	{
		label: "Analyze results",
		detail: ["Did the 5xx spike", "disappear?"],
	},
];

export function LoadTestComparison() {
	return (
		<ExperimentationLoop
			steps={steps}
			showOutcomes
			description="A spike in new Postgres connections causes a stall. Test a minimum pool size by replaying the same traffic with and without the fix. If the 5xx spike disappears, the hypothesis is supported. If it remains, return to the hypothesis."
		/>
	);
}
