export const SESSION_DURATION_MS = 24000;
// Keep event timestamps in simulation time; playback gives each result time to register.
export const SESSION_PLAYBACK_RATE = 0.55;

export const SESSION_STAGES = [
	{
		id: "setup",
		label: "Set up",
		title: "Prepare the cloud environment",
		start: 0,
		end: 4200,
		message: "I'll get an isolated environment ready, then read the report.",
		tools: [
			{
				label: "Docker Compose",
				detail: "Postgres, cache and queues are ready.",
				at: 900,
			},
			{
				label: "Infisical",
				detail:
					"Development credentials loaded. Secrets are not shown in the session.",
				at: 2100,
			},
			{
				label: "Executor",
				detail: "Slack, Axiom and engineering tools connected.",
				at: 3300,
			},
		],
	},
	{
		id: "context",
		label: "Context",
		title: "Trace the missing overage charge",
		start: 4200,
		end: 9500,
		message:
			"I'll trace the customer's billing cycle and find where the overage charge was missed.",
		tools: [
			{
				label: "Read Slack thread",
				detail:
					"Report: usage exceeded the included allowance, but the invoice has no overage line item.",
				at: 5200,
			},
			{
				label: "Query Axiom",
				detail:
					"The usage event arrived before invoice creation. The invoice was finalized without the overage item.",
				at: 6800,
			},
			{
				label: "Search codebase",
				detail:
					"Found the invoice-created handler and the integration tests covering end-of-cycle overages.",
				at: 8300,
			},
		],
	},
	{
		id: "test",
		label: "Test & fix",
		title: "Reproduce first. Then fix.",
		start: 9500,
		end: 17700,
		message:
			"I'll write a regression test before changing the handler, so we know the test catches this bug.",
		tools: [
			{
				label: "Write regression test",
				detail:
					"Create a customer with overages, exceed the allowance, advance the billing cycle, and assert the invoice line item.",
				at: 10500,
			},
			{
				label: "Run the new test",
				detail:
					"The test fails on the missing overage line item—not on setup or a network error.",
				at: 11900,
			},
			{
				label: "Update the invoice handler",
				detail:
					"Include the customer's overage charge when preparing the invoice items.",
				at: 14200,
			},
			{
				label: "Run the test again",
				detail: "The same assertion now passes with the fix applied.",
				at: 16200,
			},
		],
	},
	{
		id: "verify",
		label: "Verify",
		title: "Check for regressions",
		start: 17700,
		end: SESSION_DURATION_MS,
		message:
			"The regression test passes. I'll run the core suite and related billing tests before handing this back.",
		tools: [
			{
				label: "bun tw · core + billing",
				detail:
					"Distribute the selected test files across isolated workers and collect their results.",
				at: 18700,
			},
			{
				label: "Review changes",
				detail:
					"The change is limited to invoice-item preparation and its regression test.",
				at: 23200,
			},
		],
	},
] as const;

export type SessionStage = (typeof SESSION_STAGES)[number];

export function sessionStageAt(time: number) {
	return SESSION_STAGES.findLastIndex((stage) => time >= stage.start);
}
