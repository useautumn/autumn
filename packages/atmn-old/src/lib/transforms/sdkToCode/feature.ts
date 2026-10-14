import type { Feature } from "../../../compose/models/featureModels.js";
import { featureIdToVarName, formatValue } from "./helpers.js";

export function buildFeatureCode(feature: Feature, varNameOverride?: string): string {
	const varName = varNameOverride ?? featureIdToVarName(feature.id);
	const lines: string[] = [];

	lines.push(`export const ${varName} = feature({`);
	lines.push(`\tid: '${feature.id}',`);
	lines.push(`\tname: '${feature.name}',`);
	lines.push(`\ttype: '${feature.type}',`);

	if (feature.type === "metered") {
		lines.push(`\tconsumable: ${feature.consumable},`);
	}

	if (feature.eventNames && feature.eventNames.length > 0) {
		lines.push(`\teventNames: ${formatValue(feature.eventNames)},`);
	}

	if (feature.archived) {
		lines.push(`\tarchived: true,`);
	}

	if (feature.type === "credit_system" && feature.creditSchema) {
		lines.push(`\tcreditSchema: ${formatValue(feature.creditSchema)},`);
	}

	if (feature.type === "ai_credit_system") {
		if (feature.modelMarkups) {
			lines.push(`\tmodelMarkups: ${formatValue(feature.modelMarkups)},`);
		}
		if (feature.defaultMarkup !== undefined) {
			lines.push(`\tdefaultMarkup: ${feature.defaultMarkup},`);
		}
		if (feature.providerMarkups) {
			lines.push(`\tproviderMarkups: ${formatValue(feature.providerMarkups)},`);
		}
	}

	lines.push(`});`);

	return lines.join("\n");
}
