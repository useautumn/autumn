import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface SchemaSource {
	/** Source file in SDK (relative to sdk/src/models/) */
	sdkFile: string;
	/** Output filename */
	outputFile: string;
}

const SCHEMA_SOURCES: SchemaSource[] = [
	{
		sdkFile: "get-or-create-customer-op.ts",
		outputFile: "getOrCreateCustomerSchemas.ts",
	},
	{ sdkFile: "attach-op.ts", outputFile: "attachSchemas.ts" },
	{
		sdkFile: "open-customer-portal-op.ts",
		outputFile: "openCustomerPortalSchemas.ts",
	},
	{ sdkFile: "list-plans-op.ts", outputFile: "listPlansSchemas.ts" },
	{ sdkFile: "list-events-op.ts", outputFile: "listEventsSchemas.ts" },
	{
		sdkFile: "aggregate-events-op.ts",
		outputFile: "aggregateEventsSchemas.ts",
	},
	{
		sdkFile: "create-referral-code-op.ts",
		outputFile: "createReferralCodeSchemas.ts",
	},
	{
		sdkFile: "redeem-referral-code-op.ts",
		outputFile: "redeemReferralCodeSchemas.ts",
	},
];

/**
 * Post-process generated schema file to use zod/v4 instead of zod
 */
function fixZodImport(filePath: string): void {
	const content = readFileSync(filePath, "utf-8");
	const fixed = content.replace(
		'import { z } from "zod";',
		'import { z } from "zod/v4";',
	);
	writeFileSync(filePath, fixed, "utf-8");
}

/**
 * Generate Zod schemas from Speakeasy SDK TypeScript types
 */
export async function generateZodSchemas({
	sdkDir,
	outputDir,
}: {
	sdkDir: string;
	outputDir: string;
}): Promise<void> {
	console.log("Generating Zod schemas from SDK types...");

	const sdkModelsDir = path.join(sdkDir, "src/models");

	// Get workspace root for running ts-to-zod
	const currentFile = fileURLToPath(import.meta.url);
	const workspaceRoot = path.resolve(path.dirname(currentFile), "../../..");

	for (const source of SCHEMA_SOURCES) {
		const inputPath = path.join(sdkModelsDir, source.sdkFile);
		const outputPath = path.join(outputDir, source.outputFile);

		// Convert to relative paths from workspace root
		const relativeInput = path.relative(workspaceRoot, inputPath);
		const relativeOutput = path.relative(workspaceRoot, outputPath);

		console.log(`  ${source.sdkFile} -> ${source.outputFile}`);

		// Run ts-to-zod from workspace root with relative paths
		// Skip validation since generated files use zod/v4 after post-processing
		execSync(
			`bunx ts-to-zod --skipValidation "${relativeInput}" "${relativeOutput}"`,
			{
				stdio: "pipe",
				cwd: workspaceRoot,
			},
		);

		// Fix zod import to use zod/v4
		fixZodImport(outputPath);
	}

	// Generate index file that re-exports everything
	const exportLines = SCHEMA_SOURCES.map(
		(s) => `export * from "./${s.outputFile.replace(".ts", "")}";`,
	).join("\n");
	const indexContent = `// Generated schemas from Speakeasy SDK types
// Run \`bun api\` to regenerate

${exportLines}
`;
	writeFileSync(path.join(outputDir, "index.ts"), indexContent, "utf-8");

	// Format generated files with biome
	console.log("Formatting generated files...");
	execSync(`bunx biome check --write "${outputDir}"`, {
		stdio: "pipe",
		cwd: workspaceRoot,
	});

	console.log("Zod schemas generated!");
}
