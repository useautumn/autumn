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
				if (sample.lang !== "TypeScript") continue;
				if (!sample.source || typeof sample.source !== "string") continue;

				let transformed = sample.source;

				const variableMatch = transformed.match(
					/const\s+(\w+)\s+=\s+await\s+autumn/i,
				);

				if (variableMatch) {
					const variableName = variableMatch[1];

					const lines = transformed.split("\n");
					let foundAssignment = false;

					const processedLines = lines.map((line: string) => {
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

						if (foundAssignment && line.includes(`${variableName}.`)) {
							const variableRegex = new RegExp(`\\b${variableName}\\.`, "g");
							return line.replace(variableRegex, "data.");
						}

						return line;
					});

					transformed = processedLines.join("\n");
				}

				transformed = transformed
					.split("\n")
					.filter((line: string) => !line.trim().startsWith("console.log("))
					.join("\n");

				transformed = transformed.replace(/\n{3,}/g, "\n\n").trim();

				sample.source = transformed;
			}
		}
	}

	return spec;
}
