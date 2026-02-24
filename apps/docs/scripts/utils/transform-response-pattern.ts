/**
 * Transform TypeScript snippets to use { data, error } destructuring pattern
 * Replaces:
 *   const variableName = await autumn...
 *   console.log(variableName.xyz)
 * With:
 *   const { data, error } = await autumn...
 * (console.log lines are removed)
 */
export function transformResponsePattern({
	spec,
}: {
	spec: Record<string, unknown>;
}) {
	if (!spec.paths) {
		return spec;
	}

	for (const [_path, pathItem] of Object.entries(spec.paths)) {
		if (!pathItem || typeof pathItem !== "object") continue;

		for (const [_method, operation] of Object.entries(pathItem)) {
			if (!operation || typeof operation !== "object") continue;
			if (!("x-codeSamples" in operation)) continue;

			const codeSamples = (operation as Record<string, unknown>)[
				"x-codeSamples"
			];
			if (!Array.isArray(codeSamples)) continue;

			for (const sample of codeSamples) {
				// Only transform TypeScript samples
				if (sample.lang !== "TypeScript") continue;
				if (!sample.source || typeof sample.source !== "string") continue;

				let transformed = sample.source;

				// Step 1: Find the variable name used in "const <variableName> = await autumn"
				// Match both lowercase 'autumn' and capitalized 'Autumn'
				const variableMatch = transformed.match(
					/const\s+(\w+)\s+=\s+await\s+autumn/i,
				);

				if (variableMatch) {
					const variableName = variableMatch[1];

					// Split into lines for line-by-line processing
					const lines = transformed.split("\n");
					let foundAssignment = false;

					const processedLines = lines.map((line: string) => {
						// Step 2: Replace the declaration line with { data, error }
						if (
							!foundAssignment &&
							/const\s+\w+\s+=\s+await\s+autumn/i.test(line)
						) {
							foundAssignment = true;
							return line.replace(
								/const\s+\w+\s+=\s+await\s+autumn/i,
								"const { data, error } = await autumn",
							);
						}

						// Step 3: After finding assignment, replace variableName. with data.
						// But only if the line is not the assignment line itself
						if (foundAssignment && line.includes(`${variableName}.`)) {
							const variableRegex = new RegExp(`\\b${variableName}\\.`, "g");
							return line.replace(variableRegex, "data.");
						}

						return line;
					});

					transformed = processedLines.join("\n");
				}

				// Step 4: Remove all console.log lines
				transformed = transformed
					.split("\n")
					.filter((line: string) => !line.trim().startsWith("console.log("))
					.join("\n");

				// Clean up any trailing empty lines
				transformed = transformed.replace(/\n{3,}/g, "\n\n").trim();

				sample.source = transformed;
			}
		}
	}

	return spec;
}
