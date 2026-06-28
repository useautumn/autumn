import type { Feature } from "../../../compose/models/index.js";
import type {
	CustomizePlan,
	PlanItemFilter,
	Variant,
} from "../../../compose/models/variantModels.js";
import { escapeString, formatValue, variantIdToVarName } from "./helpers.js";
import { buildPlanItemCode } from "./planItem.js";

const featureIdCode = (
	featureId: string | undefined,
	featureVarMap?: Map<string, string>,
) => {
	if (!featureId) return undefined;
	const featureVarName = featureVarMap?.get(featureId);
	return featureVarName
		? `${featureVarName}.id`
		: `'${escapeString(featureId)}'`;
};

const buildPlanItemFilterCode = ({
	filter,
	featureVarMap,
	itemIndent,
}: {
	filter: PlanItemFilter;
	featureVarMap?: Map<string, string>;
	itemIndent: string;
}): string => {
	const fieldIndent = `${itemIndent}\t`;
	const lines: string[] = [];

	lines.push(`${itemIndent}{`);
	const featureId = featureIdCode(filter.featureId, featureVarMap);
	if (featureId) lines.push(`${fieldIndent}featureId: ${featureId},`);
	if (filter.billingMethod) {
		lines.push(`${fieldIndent}billingMethod: '${filter.billingMethod}',`);
	}
	if (filter.interval)
		lines.push(`${fieldIndent}interval: '${filter.interval}',`);
	if (filter.intervalCount !== undefined) {
		lines.push(`${fieldIndent}intervalCount: ${filter.intervalCount},`);
	}
	lines.push(`${itemIndent}},`);

	return lines.join("\n");
};

const buildCustomizeCode = ({
	customize,
	features,
	featureVarMap,
}: {
	customize: CustomizePlan;
	features: Feature[];
	featureVarMap?: Map<string, string>;
}): string[] => {
	const lines: string[] = [];

	if (customize.price !== undefined) {
		lines.push(`\t\tprice: ${formatValue(customize.price)},`);
	}

	if (customize.items) {
		lines.push(`\t\titems: [`);
		for (const planItem of customize.items) {
			lines.push(
				buildPlanItemCode({
					planItem,
					features,
					featureVarMap,
					itemIndent: "\t\t\t",
				}),
			);
		}
		lines.push(`\t\t],`);
	}

	if (customize.addItems) {
		lines.push(`\t\taddItems: [`);
		for (const planItem of customize.addItems) {
			lines.push(
				buildPlanItemCode({
					planItem,
					features,
					featureVarMap,
					itemIndent: "\t\t\t",
				}),
			);
		}
		lines.push(`\t\t],`);
	}

	if (customize.removeItems) {
		lines.push(`\t\tremoveItems: [`);
		for (const filter of customize.removeItems) {
			lines.push(
				buildPlanItemFilterCode({
					filter,
					featureVarMap,
					itemIndent: "\t\t\t",
				}),
			);
		}
		lines.push(`\t\t],`);
	}

	if (customize.freeTrial !== undefined) {
		lines.push(`\t\tfreeTrial: ${formatValue(customize.freeTrial)},`);
	}

	if (customize.billingControls !== undefined) {
		lines.push(
			`\t\tbillingControls: ${formatValue(customize.billingControls)},`,
		);
	}

	return lines;
};

export function buildVariantCode({
	basePlanVarName,
	variant,
	features,
	featureVarMap,
	varNameOverride,
}: {
	basePlanVarName: string;
	variant: Variant;
	features: Feature[];
	featureVarMap?: Map<string, string>;
	varNameOverride?: string;
}): string {
	const varName = varNameOverride ?? variantIdToVarName(variant.id);
	const lines: string[] = [];

	lines.push(`export const ${varName} = ${basePlanVarName}.variant({`);
	lines.push(`\tid: '${escapeString(variant.id)}',`);
	lines.push(`\tname: '${escapeString(variant.name)}',`);

	if (variant.customize) {
		lines.push(`\tcustomize: {`);
		lines.push(
			...buildCustomizeCode({
				customize: variant.customize,
				features,
				featureVarMap,
			}),
		);
		lines.push(`\t},`);
	}

	lines.push(`});`);

	return lines.join("\n");
}
