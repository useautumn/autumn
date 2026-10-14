import type { Feature } from "../../../compose/models/index.js";
import type { Plan } from "../../../compose/models/variantModels.js";
import { formatValue, planIdToVarName } from "./helpers.js";
import { buildPlanItemCode } from "./planItem.js";

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
	if (plan.version !== undefined) {
		lines.push(`\tversion: ${plan.version},`);
	}
	lines.push(`\tname: '${plan.name}',`);

	if (plan.description !== undefined && plan.description !== null) {
		lines.push(`\tdescription: '${plan.description}',`);
	}

	if (plan.group !== undefined && plan.group !== null && plan.group !== "") {
		lines.push(`\tgroup: '${plan.group}',`);
	}

	if (plan.addOn !== undefined) {
		lines.push(`\taddOn: ${plan.addOn},`);
	}

	if (plan.autoEnable !== undefined) {
		lines.push(`\tautoEnable: ${plan.autoEnable},`);
	}

	if (plan.archived === true) {
		lines.push(`\tarchived: true,`);
	}

	if (plan.price) {
		lines.push(`\tprice: {`);
		lines.push(`\t\tamount: ${plan.price.amount},`);
		lines.push(`\t\tinterval: '${plan.price.interval}',`);
		if (plan.price.additionalCurrencies) {
			lines.push(
				`\t\tadditionalCurrencies: ${formatValue(plan.price.additionalCurrencies)},`,
			);
		}
		lines.push(`\t},`);
	}

	lines.push(`\titems: [`);
	if (plan.items && plan.items.length > 0) {
		for (const planItem of plan.items) {
			const itemCode = buildPlanItemCode({
				planItem,
				features,
				featureVarMap,
			});
			lines.push(itemCode);
		}
	}
	lines.push(`\t],`);
	if (plan.licenses?.length) {
		lines.push(`\tlicenses: ${formatValue(plan.licenses)},`);
	}

	if (plan.freeTrial) {
		lines.push(`\tfreeTrial: ${formatValue(plan.freeTrial)},`);
	}

	if (plan.billingControls) {
		lines.push(
			`\tbillingControls: billingControls(${formatValue(plan.billingControls)}),`,
		);
	}

	lines.push(`});`);

	return lines.join("\n");
}
