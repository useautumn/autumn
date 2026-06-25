import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";

process.env.DATABASE_URL ??=
	"postgresql://postgres:postgres@localhost:5432/postgres";
process.env.ENCRYPTION_PASSWORD ??= "test";
process.env.SLACK_CLIENT_ID ??= "test";
process.env.SLACK_CLIENT_SECRET ??= "test";
process.env.SLACK_SIGNING_SECRET ??= "test";
process.env.FIRECRAWL_API_KEY ??= "fc_test";

const { formatAutumnOrgContext, loadAutumnOrgContext } = await import(
	"../../../../src/internal/autumnMcp/orgContextService.js"
);

const createLogger = () => {
	const warnings: unknown[] = [];
	return {
		logger: {
			debug: () => undefined,
			warn: (_message: string, input: unknown) => warnings.push(input),
		},
		warnings,
	};
};

describe("Autumn org context service", () => {
	test("formats preloaded tool results as raw JSON blocks", () => {
		const text = formatAutumnOrgContext({
			agentRules: { entityRules: "workspace scoped" },
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
		expect(text).toContain("listPlans:");
		expect(text).toContain("listFeatures:");
		expect(text).toContain("```json");
		expect(text).toContain("workspace scoped");
		expect(text).toContain('"rollover": true');
		expect(text).toContain('"id": "enterprise"');
		expect(text).toContain('"type": "boolean"');
	});

	test("preloads rules, plans, and features in parallel and keeps partial context", async () => {
		const calls: string[] = [];
		const { logger, warnings } = createLogger();
		const executeTool = async ({ toolName }: { toolName: string }) => {
			calls.push(toolName);
			if (toolName === "getAgentRules") throw new Error("rules unavailable");
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
			"listFeatures",
			"listPlans",
		]);
		expect(context?.text).toContain('"id": "launch"');
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
		expect(context?.text).toContain("listPlans:");
		expect(context?.text).not.toContain("listFeatures:");
		expect(warnings).toHaveLength(1);
	});
});
