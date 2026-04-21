import { ErrCode, RecaseError } from "@autumn/shared";

export const resolveModelName = ({
	modelName,
	markups,
}: {
	modelName: string;
	markups: Record<string, unknown>;
}): { providerKey: string; modelKey: string; canonical: string } => {
	// Case 1: Has `|` -> explicit provider
	if (modelName.includes("|")) {
		const separatorIndex = modelName.indexOf("|");
		const providerKey = modelName.slice(0, separatorIndex);
		const modelKey = modelName.slice(separatorIndex + 1);

		return {
			providerKey,
			modelKey,
			canonical: `${providerKey}/${modelKey}`,
		};
	}

	// Case 2: No `|` -> resolve from markups by stripping provider prefixes
	const matches: string[] = [];

	for (const markupKey of Object.keys(markups)) {
		const slashIndex = markupKey.indexOf("/");
		if (slashIndex === -1) continue;

		const modelPart = markupKey.slice(slashIndex + 1);
		if (modelPart === modelName) {
			matches.push(markupKey);
		}
	}

	if (matches.length === 1) {
		const canonical = matches[0];
		const slashIndex = canonical.indexOf("/");
		return {
			providerKey: canonical.slice(0, slashIndex),
			modelKey: canonical.slice(slashIndex + 1),
			canonical,
		};
	}

	if (matches.length === 0) {
		throw new RecaseError({
			message: `Model "${modelName}" not found. Check the model name or specify provider with \`provider|model\`.`,
			code: ErrCode.InvalidRequest,
			data: { modelName },
		});
	}

	// Multiple matches -> ambiguous
	throw new RecaseError({
		message: `Model "${modelName}" is ambiguous — found in multiple providers: ${matches.join(", ")}. Specify the provider with \`provider|model\`.`,
		code: ErrCode.InvalidRequest,
		data: { modelName, matches },
	});
};
