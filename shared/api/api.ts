import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Dynamic imports to avoid duplicate schema registration when supporting multiple versions

// Determine which version to export
const versionArg = process.argv.find((arg) => arg.startsWith("--version="));
let version: string;
let hasExplicitVersion = false;

if (versionArg) {
	version = versionArg.split("=")[1];
	hasExplicitVersion = true;
} else {
	// Check for positional argument (e.g., "bun api 1.2")
	const positionalArg = process.argv.find(
		(arg, index) => index >= 2 && !arg.startsWith("--"),
	);

	if (positionalArg) {
		hasExplicitVersion = true;
		// If version has only one dot (e.g., "1.2"), append ".0" to make it "1.2.0"
		version =
			positionalArg.split(".").length === 2
				? `${positionalArg}.0`
				: positionalArg;
	} else {
		version = "2.1.0";
	}
}

// Export to YAML file during build
if (process.env.NODE_ENV !== "production") {
	try {
		let writeOpenApiFunc:
			| (({
					outputFilePath,
			  }: {
					outputFilePath: string;
			  }) => void | Promise<void>)
			| null = null;
		const currentFilePath = fileURLToPath(import.meta.url);
		const currentDirPath = path.dirname(currentFilePath);
		const outputDirPath = path.resolve(currentDirPath, "../openapi");
		const outputFileName = hasExplicitVersion
			? `openapi-${version}.yml`
			: "openapi.yml";
		const outputFilePath = path.join(outputDirPath, outputFileName);
		const defaultOutputFilePath = path.join(outputDirPath, "openapi.yml");
		const speakeasySdkDirPath = path.resolve(
			currentDirPath,
			"../../packages/sdk",
		);
		const docsApiDirPath = path.resolve(
			currentDirPath,
			"../../apps/docs/mintlify/api",
		);
		const docsOpenApiLocalPath = path.join(docsApiDirPath, "openapi-local.yml");

		mkdirSync(outputDirPath, { recursive: true });
		mkdirSync(docsApiDirPath, { recursive: true });

		// Dynamically import the correct version to avoid schema conflicts
		if (version === "1.2.0") {
			const { writeOpenApi_1_2_0 } = await import(
				"./_openapi/prevVersions/openapi1.2/openapi1.2.0.js"
			);
			writeOpenApiFunc = writeOpenApi_1_2_0;
			console.log("Using OpenAPI version 1.2.0");
		} else if (version === "2.0.0") {
			const { writeOpenApi_2_0_0 } = await import(
				"./_openapi/v2.0/openapi2.0.js"
			);
			writeOpenApiFunc = writeOpenApi_2_0_0;
			console.log("Using OpenAPI version 2.0.0");
		} else if (version === "2.1.0") {
			const { writeOpenApi_2_1_0 } = await import(
				"./_openapi/v2.1/openapi2.1.js"
			);
			writeOpenApiFunc = writeOpenApi_2_1_0;
			console.log("Using OpenAPI version 2.1.0");
		} else {
			console.error(
				`Unknown version: ${version}. Supported versions: 1.2.0, 2.0.0, 2.1.0`,
			);
			process.exit(1);
		}

		await writeOpenApiFunc({ outputFilePath });
		console.log(`OpenAPI document exported to ${outputFilePath}`);

		if (version === "2.1.0" && outputFilePath !== defaultOutputFilePath) {
			await writeOpenApiFunc({ outputFilePath: defaultOutputFilePath });
			console.log(
				`OpenAPI document exported to ${defaultOutputFilePath} for Speakeasy`,
			);
		}

		if (version === "2.1.0") {
			console.log("Running Speakeasy SDK generation...");
			execSync("bunx speakeasy run -t autumn", {
				stdio: "inherit",
				cwd: speakeasySdkDirPath,
			});
			console.log("Speakeasy SDK generation completed");

			console.log("Building @useautumn/sdk dist output...");
			execSync("bun run build", {
				stdio: "inherit",
				cwd: speakeasySdkDirPath,
			});
			console.log("@useautumn/sdk build completed");

			console.log("Applying Speakeasy code samples to OpenAPI for docs...");
			execSync(
				`bunx speakeasy overlay apply --schema .speakeasy/out.openapi.yaml --overlay .speakeasy/code-samples.overlay.yaml --out ${JSON.stringify(docsOpenApiLocalPath)}`,
				{
					stdio: "inherit",
					cwd: speakeasySdkDirPath,
				},
			);
			console.log(`Docs OpenAPI written to ${docsOpenApiLocalPath}`);
		} else {
			console.log(
				`Skipping Speakeasy generation for OpenAPI ${version}; only 2.1.0 is wired to SDK generation`,
			);
		}
	} catch (error) {
		console.error("Failed to export OpenAPI document:", error);
		process.exit(1);
	}

	// Exit the process after completion
	process.exit(0);
}
