import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { logger } from "../external/logtail/logtailUtils";
import type { DrizzleCli } from "./initDrizzle";

type SqlFunction = {
	name: string;
	sourceFile: string;
	content: string;
	contentHash: string;
};

/**
 * Dynamically discover SQL functions from the deductRpc folder
 */
const discoverSqlFunctions = (): SqlFunction[] => {
	const __filename = fileURLToPath(import.meta.url);
	const deductRpcPath = join(
		__filename,
		"../../internal/balances/track/trackUtils/deductRpc",
	);

	const sqlFiles = readdirSync(deductRpcPath).filter((file) =>
		file.endsWith(".sql"),
	);

	return sqlFiles.map((file) => {
		const filePath = join(deductRpcPath, file);
		const content = readFileSync(filePath, "utf-8");

		// Extract function name from CREATE FUNCTION statement
		const functionNameMatch = content.match(
			/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(\w+)/i,
		);
		const functionName = functionNameMatch?.[1];

		if (!functionName) {
			throw new Error(`Could not extract function name from ${file}`);
		}

		// Create hash of normalized content (ignore whitespace differences)
		const normalizedContent = content
			.replace(/--.*$/gm, "") // Remove comments
			.replace(/\s+/g, " ") // Normalize whitespace
			.trim();

		const contentHash = createHash("sha256")
			.update(normalizedContent)
			.digest("hex")
			.substring(0, 16);

		return {
			name: functionName,
			sourceFile: file,
			content,
			contentHash,
		};
	});
};

export const validateSqlFunctions = async ({
	db,
	validateContent = false,
}: {
	db: DrizzleCli;
	validateContent?: boolean;
}) => {
	const start = Date.now();

	// Dynamically discover SQL functions from source files
	const requiredFunctions = discoverSqlFunctions();
	logger.info(
		`Discovered ${requiredFunctions.length} SQL functions from source files`,
	);

	// Query database for existing functions and their definitions
	const result = await db.execute<{
		function_name: string;
		definition: string;
	}>(sql`
		SELECT 
			p.proname as function_name,
			pg_get_functiondef(p.oid) as definition
		FROM pg_proc p
		JOIN pg_namespace n ON p.pronamespace = n.oid
		WHERE n.nspname = 'public'
		AND p.prokind = 'f'
		ORDER BY p.proname;
	`);

	const dbFunctions = new Map(
		result.map((row) => [row.function_name, row.definition]),
	);

	// Check for missing functions
	const missingFunctions = requiredFunctions.filter(
		(fn) => !dbFunctions.has(fn.name),
	);

	if (missingFunctions.length > 0) {
		const missingDetails = missingFunctions
			.map((fn) => `'${fn.name}' (from ${fn.sourceFile})`)
			.join(", ");

		logger.error(
			`SQL function validation failed: Missing functions: ${missingDetails}`,
		);
		throw new Error(`Missing SQL functions: ${missingDetails}`);
	}

	// Optionally validate function content
	const mismatchedFunctions: Array<{
		name: string;
		sourceFile: string;
		reason: string;
	}> = [];

	if (validateContent) {
		for (const fn of requiredFunctions) {
			const dbDefinition = dbFunctions.get(fn.name);
			if (!dbDefinition) continue;

			// Normalize both definitions for comparison
			const normalizeFunc = (str: string) =>
				str
					.replace(/--.*$/gm, "") // Remove comments
					.replace(/\s+/g, " ") // Normalize whitespace
					.toLowerCase()
					.trim();

			const normalizedSource = normalizeFunc(fn.content);
			const normalizedDb = normalizeFunc(dbDefinition);

			// Create hashes for comparison
			const sourceHash = createHash("sha256")
				.update(normalizedSource)
				.digest("hex")
				.substring(0, 16);

			const dbHash = createHash("sha256")
				.update(normalizedDb)
				.digest("hex")
				.substring(0, 16);

			if (sourceHash !== dbHash) {
				mismatchedFunctions.push({
					name: fn.name,
					sourceFile: fn.sourceFile,
					reason: `Source hash: ${sourceHash}, DB hash: ${dbHash}`,
				});
			}
		}

		if (mismatchedFunctions.length > 0) {
			const mismatchDetails = mismatchedFunctions
				.map((fn) => `'${fn.name}' (${fn.sourceFile}): ${fn.reason}`)
				.join("; ");

			logger.warn(`SQL function content mismatch detected: ${mismatchDetails}`);
			logger.warn(
				"Functions exist but their content differs from source files. Run migrations to update.",
			);
		}
	}

	const elapsed = Date.now() - start;

	logger.info(
		`SQL function validation passed - ${requiredFunctions.length} functions verified in ${elapsed}ms${validateContent ? " (content validated)" : ""}`,
	);

	if (mismatchedFunctions.length > 0) {
		logger.info(
			`⚠️  ${mismatchedFunctions.length} function(s) have content differences`,
		);
	}

	return true;
};
