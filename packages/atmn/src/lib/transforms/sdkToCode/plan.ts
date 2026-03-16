import type { Feature, Plan } from "../../../compose/models/index.js";
import { formatValue, planIdToVarName } from "./helpers.js";
import { buildPlanItemCode } from "./planItem.js";

/**
 * Generate TypeScript code for a plan definition
 *
 * @param plan The plan to generate code for
 * @param features List of features
 * @param featureVarMap Optional map of feature ID -> variable name for preserving local names
 * @param varNameOverride Optional variable name override (used for collision disambiguation)
 */
export function buildPlanCode(
	plan: Plan,
	features: Feature[],
	featureVarMap?: Map<string, string>,
	varNameOverride?: string,
): string {
	const varName = varNameOverride ?? planIdToVarName(plan.id);
	const lines: string[] = [];

	lines.push(`export const ${varName} = plan({`);
	lines.push(`\tid: '${plan.id}',`);
	lines.push(`\tname: '${plan.name}',`);

	// Add description
	if (plan.description !== undefined && plan.description !== null) {
		lines.push(`\tdescription: '${plan.description}',`);
	}

	// Add group (only if it has a non-empty string value)
	// undefined and null both mean "no group" and should be omitted from generated code
	if (plan.group !== undefined && plan.group !== null && plan.group !== "") {
		lines.push(`\tgroup: '${plan.group}',`);
	}

	// Add addOn (only if true - false becomes undefined via swapFalse)
	if (plan.addOn !== undefined) {
		lines.push(`\taddOn: ${plan.addOn},`);
	}

	// Add autoEnable (only if true - false becomes undefined via swapFalse)
	if (plan.autoEnable !== undefined) {
		lines.push(`\tautoEnable: ${plan.autoEnable},`);
	}

	// Add price
	if (plan.price) {
		lines.push(`\tprice: {`);
		lines.push(`\t\tamount: ${plan.price.amount},`);
		lines.push(`\t\tinterval: '${plan.price.interval}',`);
		lines.push(`\t},`);
	}

	// Add items (always include array for parser detection)
	lines.push(`\titems: [`);
	if (plan.items && plan.items.length > 0) {
		for (const planItem of plan.items) {
			const itemCode = buildPlanItemCode(
				planItem,
				features,
				featureVarMap,
			);
			lines.push(itemCode);
		}
	}
	lines.push(`\t],`);

	// Add freeTrial
	if (plan.freeTrial) {
		lines.push(`\tfreeTrial: ${formatValue(plan.freeTrial)},`);
	}

	lines.push(`});`);

	return lines.join("\n");
}
