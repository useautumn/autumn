import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";

process.env.DATABASE_URL ??=
	"postgresql://postgres:postgres@localhost:5432/postgres";
process.env.ENCRYPTION_PASSWORD ??= "test";
process.env.SLACK_CLIENT_ID ??= "test";
process.env.SLACK_CLIENT_SECRET ??= "test";
process.env.SLACK_SIGNING_SECRET ??= "test";

const { formatAutumnOrgContext, loadAutumnOrgContext } = await import(
	"../../../../src/internal/autumnMcp/orgContextService.js"
);

const createLogger = () => {
	const warnings: unknown[] = [];
	return {
		logger: {
			debug: () => undefined,
			info: () => undefined,
			warn: (_message: string, input: unknown) => warnings.push(input),
		},
		warnings,
	};
};

describe("Autumn org context service", () => {
	test("formats preloaded tool results as raw JSON blocks", () => {
		const text = formatAutumnOrgContext({
			agentRules: {
				entityRules: "workspace scoped",
				notes: "Always use invoice mode.",
			},
			features: {
				features: [
					{
						id: "compliance_controls",
						name: "Compliance controls",
						type: "boolean",
					},
				],
			},
			plans: {
				plans: [
					{
						id: "pro",
						items: [{ feature_id: "credits", rollover: true }],
						name: "Pro",
						version: 1,
					},
					{ id: "enterprise", name: "Enterprise" },
				],
			},
		});

		expect(text).toContain("getAgentRules:");
		expect(text).toContain("listPlans (compact index");
		expect(text).toContain("listFeatures (compact index)");
		expect(text).toContain("```json");
		expect(text).toContain("workspace scoped");
		expect(text).not.toContain("Always use invoice mode.");
		expect(text).toContain('"items":["credits"]');
		expect(text).toContain('"id":"enterprise"');
		expect(text).toContain('"type":"boolean"');
	});

	test("separates custom instructions from preloaded context", async () => {
		const { logger } = createLogger();
		const context = await loadAutumnOrgContext({
			env: AppEnv.Sandbox,
			executeTool: (async ({ toolName }: { toolName: string }) =>
				toolName === "getAgentRules"
					? { entity_rules: {}, notes: "Always use invoice mode." }
					: []) as never,
			logger: logger as never,
			token: "test",
		});

		expect(context?.instructions).toBe("Always use invoice mode.");
		expect(context?.text).not.toContain("Always use invoice mode.");
	});

	test("preloads org identity, rules, plans, and features in parallel and keeps partial context", async () => {
		const calls: string[] = [];
		const { logger, warnings } = createLogger();
		const executeTool = async ({ toolName }: { toolName: string }) => {
			calls.push(toolName);
			if (toolName === "getAgentRules") throw new Error("rules unavailable");
			if (toolName === "getCurrentOrganization") {
				return { id: "org_123", name: "Resend", slug: "resend" };
			}
			return [{ id: "launch", name: "Launch" }];
		};

		const context = await loadAutumnOrgContext({
			env: AppEnv.Sandbox,
			executeTool: executeTool as never,
			logger: logger as never,
			token: "test",
		});

		expect(calls.sort()).toEqual([
			"getAgentRules",
			"getCurrentOrganization",
			"listFeatures",
			"listPlans",
		]);
		expect(context?.text).toContain("getCurrentOrganization:");
		expect(context?.text).toContain('"slug": "resend"');
		expect(context?.text).toContain('"id":"launch"');
		expect(warnings).toHaveLength(1);
	});

	test("keeps rules and plans when feature preload fails", async () => {
		const { logger, warnings } = createLogger();
		const executeTool = async ({ toolName }: { toolName: string }) => {
			if (toolName === "listFeatures") throw new Error("features unavailable");
			return { toolName };
		};

		const context = await loadAutumnOrgContext({
			env: AppEnv.Sandbox,
			executeTool: executeTool as never,
			logger: logger as never,
			token: "test",
		});

		expect(context?.text).toContain("getAgentRules:");
		expect(context?.text).toContain("listPlans (compact index");
		expect(context?.text).not.toContain("listFeatures:");
		expect(warnings).toHaveLength(1);
	});
});

describe("org context stale-while-revalidate cache", () => {
	const { setSystemTime } = require("bun:test") as {
		setSystemTime: (time?: Date) => void;
	};

	const makeExecuteTool = () => {
		let rounds = 0;
		const executeTool = async ({ toolName }: { toolName: string }) => {
			if (toolName === "getCurrentOrganization") rounds += 1;
			return { round: rounds, tool: toolName };
		};
		return { executeTool, rounds: () => rounds };
	};

	const loadFor = (orgId: string, executeTool: unknown) => {
		const { logger } = createLogger();
		const {
			autumnOrgContextService,
		} = require("../../../../src/internal/autumnMcp/orgContextService.js");
		return autumnOrgContextService.load({
			env: AppEnv.Sandbox,
			executeTool,
			logger,
			orgId,
			token: "tok",
		}) as Promise<{ text: string } | undefined>;
	};

	const flushBackground = () =>
		new Promise((resolve) => setTimeout(resolve, 5));

	test("fresh window shares one load across threads", async () => {
		setSystemTime(new Date("2026-08-24T10:00:00Z"));
		try {
			const { executeTool, rounds } = makeExecuteTool();
			const first = await loadFor("org_swr_fresh", executeTool);
			const second = await loadFor("org_swr_fresh", executeTool);
			expect(rounds()).toBe(1);
			expect(second?.text).toBe(first?.text ?? "");
		} finally {
			setSystemTime();
		}
	});

	test("stale window serves the old snapshot and refreshes in background", async () => {
		try {
			setSystemTime(new Date("2026-08-24T11:00:00Z"));
			const { executeTool, rounds } = makeExecuteTool();
			const first = await loadFor("org_swr_stale", executeTool);

			setSystemTime(new Date("2026-08-24T11:02:00Z"));
			const stale = await loadFor("org_swr_stale", executeTool);
			expect(stale?.text).toBe(first?.text ?? "");

			await flushBackground();
			expect(rounds()).toBe(2);

			const refreshed = await loadFor("org_swr_stale", executeTool);
			expect(refreshed?.text).toContain('"round": 2');
		} finally {
			setSystemTime();
		}
	});

	test("past the stale window the load blocks on a fresh fetch", async () => {
		try {
			setSystemTime(new Date("2026-08-24T12:00:00Z"));
			const { executeTool, rounds } = makeExecuteTool();
			await loadFor("org_swr_expired", executeTool);

			setSystemTime(new Date("2026-08-24T12:20:00Z"));
			const reloaded = await loadFor("org_swr_expired", executeTool);
			expect(rounds()).toBe(2);
			expect(reloaded?.text).toContain('"round": 2');
		} finally {
			setSystemTime();
		}
	});
});
