import { expect, test } from "bun:test";

interface ShippedWorkflow {
	on: {
		check_run?: { types: string[] };
		status?: null;
		workflow_run: { workflows: string[]; types: string[] };
		schedule: { cron: string }[];
		workflow_dispatch: null;
	};
	permissions: Record<string, string>;
	jobs: {
		"sync-ci": {
			if?: string;
			steps: { env: { EVENT_SHA: string }; run: string; uses?: string }[];
		};
	};
}

const workflow = Bun.YAML.parse(
	await Bun.file(
		new URL("./workflows/mark-shipped-pr-ci.yml", import.meta.url),
	).text(),
) as ShippedWorkflow;
const job = workflow.jobs["sync-ci"];
const step = job.steps[0];

test("refreshes when an external check completes after GitHub Actions CI", () => {
	expect(workflow.on.check_run?.types).toContain("completed");
});

test("refreshes when an external commit status changes", () => {
	expect(Object.hasOwn(workflow.on, "status")).toBe(true);
});

test("targets the event commit instead of the default branch commit", () => {
	expect(step.env.EVENT_SHA).toBe(
		`\${{ github.event.workflow_run.head_sha || github.event.check_run.head_sha || github.event.sha || '' }}`,
	);
	expect(step.run).toContain(".head.sha == env.EVENT_SHA");
	expect(step.run).toContain(".head.repo.full_name == env.GITHUB_REPOSITORY");
	expect(step.run).toContain("pulls?state=open&base=main&per_page=100");
});

test("ignores GitHub Actions check events to avoid reacting to itself", () => {
	expect(job.if).toBe(
		`\${{ github.event_name != 'check_run' || github.event.check_run.app.slug != 'github-actions' }}`,
	);
});

test("keeps workflow completion, scheduled and manual refreshes", () => {
	expect(workflow.on.workflow_run.types).toEqual([
		"requested",
		"in_progress",
		"completed",
	]);
	expect(workflow.on.workflow_run.workflows).toHaveLength(8);
	expect(workflow.on.schedule).toEqual([{ cron: "*/5 * * * *" }]);
	expect(Object.hasOwn(workflow.on, "workflow_dispatch")).toBe(true);
});

test("keeps CI validation in infra without checking out pull request code", () => {
	expect(workflow.permissions).toEqual({ "pull-requests": "read" });
	expect(job.steps.every((step) => step.uses === undefined)).toBe(true);
	expect(step.run).toContain('"$DEPLOY_URL/api/shipped/ci"');
	expect(step.run).not.toContain("github.event.check_run.conclusion");
});

test("the notification step remains valid Bash without executing it", async () => {
	const result = Bun.spawn(["bash", "-n"], {
		stdin: new Blob([step.run]),
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(await result.exited).toBe(0);
	expect(await new Response(result.stderr).text()).toBe("");
});
