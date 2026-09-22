import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateApiReference } from "../../utils/apiReferenceGenerator/index.js";
import { parseOpenApi } from "../../utils/apiReferenceGenerator/parseOpenApi.js";
import { writeLatestOpenApi } from "../openapi.js";

const directory = mkdtempSync(path.join(tmpdir(), "platform-stripe-docs-"));
const openApiPath = path.join(directory, "openapi.yml");
const outputDir = path.join(directory, "api-reference");

beforeAll(async () => {
	await writeLatestOpenApi({ outputFilePath: openApiPath });
	await generateApiReference({
		openApiPath,
		outputDir,
		manualMdxDir: path.resolve(
			import.meta.dir,
			"../../../../apps/docs/api-reference-generator",
		),
	});
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

test.each([
	{
		operationId: "getStripeConnection",
		endpoint: "/v1/platform.get_stripe_connection",
		fields: ["connected", "account_id", "connected_at"],
		guideText: "historical connections",
	},
	{
		operationId: "disconnectStripe",
		endpoint: "/v1/platform.disconnect_stripe",
		fields: ["success"],
		guideText: "already disconnected",
	},
])("generates the $operationId contract and reference page", (scenario) => {
	const operation = parseOpenApi({ openApiPath }).find(
		(candidate) => candidate.path === scenario.endpoint,
	);
	expect(operation).toBeDefined();
	expect(operation).toMatchObject({
		method: "POST",
		tag: "platform",
		operationId: scenario.operationId,
	});
	expect(operation?.requestBody).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ name: "organization_slug", required: true }),
			expect.objectContaining({
				name: "env",
				required: true,
				enumValues: ["test", "live"],
			}),
		]),
	);
	expect(operation?.responses?.["200"]?.map((field) => field.name)).toEqual([
		...scenario.fields,
	]);
	if (scenario.operationId === "disconnectStripe") {
		expect(operation?.responses?.["200"]).toEqual([
			expect.objectContaining({ name: "success", type: "true" }),
		]);
	}
	const pagePath = path.join(
		outputDir,
		"platform",
		`${scenario.operationId}.mdx`,
	);
	expect(existsSync(pagePath)).toBe(true);
	const page = readFileSync(pagePath, "utf8");
	expect(page).toContain(`POST ${scenario.endpoint}`);
	expect(page).toContain(scenario.guideText);
	expect(page).toContain("organization_slug");
	expect(page).toContain("DynamicResponseField");
});
