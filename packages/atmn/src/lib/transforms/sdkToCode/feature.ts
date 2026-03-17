import type { Feature } from "../../../compose/models/featureModels.js";
import { featureIdToVarName, formatValue } from "./helpers.js";

/**
 * Generate TypeScript code for a feature definition
 *
 * Rules:
 * - Boolean features: No consumable field
 * - Metered features: MUST output consumable: true or false explicitly
 * - Credit system features: Don't output consumable (implied true)
 *
 * @param varNameOverride Optional variable name override (used for collision disambiguation)
 */
export function buildFeatureCode(feature: Feature, varNameOverride?: string): string {
	const varName = varNameOverride ?? featureIdToVarName(feature.id);
	const lines: string[] = [];

	lines.push(`export const ${varName} = feature({`);
	lines.push(`\tid: '${feature.id}',`);
	lines.push(`\tname: '${feature.name}',`);
	lines.push(`\ttype: '${feature.type}',`);

	// Metered features MUST have explicit consumable field
	// consumable: true = single_use (usage is consumed)
	// consumable: false = continuous_use (usage accumulates, like seats)
	if (feature.type === "metered") {
		lines.push(`\tconsumable: ${feature.consumable},`);
	}

	// Add eventNames if present
	if (feature.eventNames && feature.eventNames.length > 0) {
		lines.push(`\teventNames: ${formatValue(feature.eventNames)},`);
	}

	// Add archived flag only when explicitly true
	if (feature.archived) {
		lines.push(`\tarchived: true,`);
	}

	// Add creditSchema for credit_system features
	if (feature.type === "credit_system" && feature.creditSchema) {
		lines.push(`\tcreditSchema: ${formatValue(feature.creditSchema)},`);
	}

	lines.push(`});`);

	return lines.join("\n");
}
