import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

// Dynamic imports to avoid duplicate schema registration when supporting multiple versions

// Determine which version to export
const versionArg = process.argv.find((arg) => arg.startsWith("--version="));
const version = versionArg ? versionArg.split("=")[1] : "2.0.0";

// Export to YAML file during build
if (process.env.NODE_ENV !== "production") {
	try {
		let writeOpenApiFunc: (() => void) | null = null;

		// Dynamically import the correct version to avoid schema conflicts
		if (version === "1.2.0") {
			const { writeOpenApi_1_2_0 } = await import(
				"./_prevVersions/openapi1.2.0.js"
			);
			writeOpenApiFunc = writeOpenApi_1_2_0;
			console.log("Using OpenAPI version 1.2.0");
		} else if (version === "2.0.0") {
			const { writeOpenApi_2_0_0 } = await import(
				"./_openapi2.0_/openapi2.0.js"
			);
			writeOpenApiFunc = writeOpenApi_2_0_0;
			console.log("Using OpenAPI version 2.0.0");
		} else {
			console.error(
				`Unknown version: ${version}. Supported versions: 1.2.0, 2.0.0`,
			);
			process.exit(1);
		}

		// If --no-build flag is present, write the OpenAPI spec and exit
		if (process.argv.includes("--no-build")) {
			writeOpenApiFunc();
			console.log(
				`OpenAPI document exported to ${process.env.STAINLESS_PATH}/openapi.yml`,
			);
			process.exit(0);
		}

		// Write OpenAPI spec and optionally run Stainless generation
		if (process.env.STAINLESS_PATH) {
			writeOpenApiFunc();
			// writeFileSync(
			// 	`${process.env.STAINLESS_PATH.replace("\\ ", " ")}/openapi.yml`,
			// 	yamlContent,
			// 	"utf8",
			// );

			// console.log(
			// 	`OpenAPI document exported to ${process.env.STAINLESS_PATH}/openapi.yml`,
			// );

			// Run the run.sh script if it exists
			const runScriptPath = `${process.env.STAINLESS_PATH.replace("\\ ", " ")}/run.sh`;
			const runStainless = !process.argv.includes("--noEmit");
			if (existsSync(runScriptPath) && runStainless) {
				try {
					console.log("Running Stainless generation script...");
					execSync(`chmod +x "${runScriptPath}" && "${runScriptPath}"`, {
						stdio: "inherit",
						cwd: process.env.STAINLESS_PATH,
					});
					console.log("Stainless generation completed successfully");
				} catch (error) {
					console.error("Failed to run Stainless generation script:", error);
				}
			} else
				console.log(
					`\n${!runStainless ? "Stainless generation skipped due to --noEmit flag" : "Stainless generation script not found"}`,
				);
		}

		// If docs path, run bun pull to update documentation
		if (process.env.DOCS_PATH) {
			const docsPath = process.env.DOCS_PATH.replace("\\ ", " ");
			try {
				console.log("Updating documentation with Mintlify...");
				execSync("bun pull", {
					stdio: "inherit",
					cwd: docsPath,
				});
				console.log("Documentation updated successfully");
			} catch (error) {
				console.error("Failed to update documentation:", error);
			}
		}
	} catch (error) {
		console.error("Failed to export OpenAPI document:", error);
		process.exit(1);
	}

	// Exit the process after completion
	process.exit(0);
}
