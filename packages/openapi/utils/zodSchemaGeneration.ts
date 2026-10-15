import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * An operation's `-op`/`-response` file, or a type found by name. Speakeasy names other files
 * after hoisted inline schemas, so they're renamed whenever the spec changes.
 */
type SchemaSource =
	| { sdkFile: string; outputFile: string }
	| { exportedType: string; outputFile: string };

type ResolvedSchemaSource = { sdkFile: string; outputFile: string };

export const isStableSdkFile = (file: string) =>
	/-(op|response)\.ts$/.test(file);

export const SCHEMA_SOURCES: SchemaSource[] = [
	{
		sdkFile: "get-or-create-customer-op.ts",
		outputFile: "getOrCreateCustomerSchemas.ts",
	},
	{ sdkFile: "attach-response.ts", outputFile: "attachSchemas.ts" },
	{
		sdkFile: "preview-attach-response.ts",
		outputFile: "previewAttachSchemas.ts",
	},
	{
		sdkFile: "billing-update-response.ts",
		outputFile: "updateSubscriptionSchemas.ts",
	},
	{
		sdkFile: "preview-update-response.ts",
		outputFile: "previewUpdateSubscriptionSchemas.ts",
	},
	{
		sdkFile: "open-customer-portal-op.ts",
		outputFile: "openCustomerPortalSchemas.ts",
	},
	{
		sdkFile: "setup-payment-response.ts",
		outputFile: "setupPaymentSchemas.ts",
	},
	{ sdkFile: "multi-attach-op.ts", outputFile: "multiAttachSchemas.ts" },
	{
		sdkFile: "preview-multi-attach-op.ts",
		outputFile: "previewMultiAttachSchemas.ts",
	},
	{ sdkFile: "list-plans-response.ts", outputFile: "listPlansSchemas.ts" },
	{ exportedType: "ListPlansParams", outputFile: "listPlansParamsSchemas.ts" },
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
		sdkFile: "create-referral-program-op.ts",
		outputFile: "createReferralProgramSchemas.ts",
	},
	{
		sdkFile: "create-reward-op.ts",
		outputFile: "createRewardSchemas.ts",
	},
	{
		sdkFile: "redeem-referral-code-op.ts",
		outputFile: "redeemReferralCodeSchemas.ts",
	},
];

const describeSource = (source: SchemaSource) =>
	`${"sdkFile" in source ? source.sdkFile : source.exportedType} -> ${source.outputFile}`;

/** Finds each source's file in the SDK models; every missing or ambiguous one is reported together. */
export const resolveSchemaSources = ({
	sdkModelsDir,
	sources,
}: {
	sdkModelsDir: string;
	sources: SchemaSource[];
}): ResolvedSchemaSource[] => {
	const modelFiles = readdirSync(sdkModelsDir).filter((file) =>
		file.endsWith(".ts"),
	);
	const exportersOf = (typeName: string) => {
		const declaration = new RegExp(
			`^export type ${typeName}\\b(?! *[A-Za-z0-9_$])`,
			"m",
		);
		return modelFiles.filter((file) =>
			declaration.test(readFileSync(path.join(sdkModelsDir, file), "utf-8")),
		);
	};

	const problems: string[] = [];
	const resolved = sources.flatMap((source): ResolvedSchemaSource[] => {
		if ("sdkFile" in source) {
			if (existsSync(path.join(sdkModelsDir, source.sdkFile))) return [source];
			problems.push(`  ${describeSource(source)}: file missing`);
			return [];
		}
		const files = exportersOf(source.exportedType);
		if (files.length === 1) {
			return [{ sdkFile: files[0] as string, outputFile: source.outputFile }];
		}
		problems.push(
			files.length === 0
				? `  ${describeSource(source)}: no model exports it`
				: `  ${describeSource(source)}: exported by ${files.join(", ")}`,
		);
		return [];
	});
	if (problems.length > 0) {
		throw new Error(
			`SDK models missing or ambiguous for Zod generation:\n${problems.join("\n")}`,
		);
	}
	return resolved;
};

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

	const sources = resolveSchemaSources({
		sdkModelsDir,
		sources: SCHEMA_SOURCES,
	});

	for (const source of sources) {
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
