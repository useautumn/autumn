import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { webhookRegistry } from "@autumn/shared";
import { writeLatestOpenApi } from "../../latest/openapi.js";
import { type GeneratedWebhookPage, generateApiReference } from "./index.js";

const directory = mkdtempSync(path.join(tmpdir(), "webhook-pages-"));
const openApiPath = path.join(directory, "openapi.yml");
const outputDir = path.join(directory, "api-reference");
let webhookPages: GeneratedWebhookPage[] = [];

beforeAll(async () => {
	await writeLatestOpenApi({ outputFilePath: openApiPath });
	({ webhookPages } = await generateApiReference({
		openApiPath,
		outputDir,
		manualMdxDir: path.resolve(
			import.meta.dir,
			"../../../../apps/docs/api-reference-generator",
		),
	}));
}, 60_000);

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const webhookPagePath = (operationId: string) =>
	path.join(outputDir, "webhooks", `${operationId}.mdx`);

test("schemaless registry entries get no webhook page or nav entry", () => {
	const schemaless = webhookRegistry.filter((definition) => !definition.schema);
	expect(schemaless.length).toBeGreaterThan(0);

	for (const { operationId } of schemaless) {
		expect(existsSync(webhookPagePath(operationId))).toBe(false);
		expect(webhookPages.map((page) => page.pagePath)).not.toContain(
			`api-reference/webhooks/${operationId}`,
		);
	}
});

test("registry entries with a schema keep their page and nav entry", () => {
	const withSchema = webhookRegistry.filter((definition) => definition.schema);

	expect(webhookPages).toEqual(
		withSchema.map(({ operationId, group }) => ({
			group,
			pagePath: `api-reference/webhooks/${operationId}`,
		})),
	);
	for (const { operationId } of withSchema) {
		expect(existsSync(webhookPagePath(operationId))).toBe(true);
	}
});
