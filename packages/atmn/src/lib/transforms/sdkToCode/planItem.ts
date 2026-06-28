import type { Feature, PlanItem } from "../../../compose/models/index.js";
import { formatValue } from "./helpers.js";

const isBooleanFeatureItem = ({
	planItem,
	features,
}: {
	planItem: PlanItem;
	features: Feature[];
}) =>
	features.some(
		(feature) =>
			feature.id === planItem.featureId && feature.type === "boolean",
	);

const shouldEmitIncluded = ({
	planItem,
	features,
}: {
	planItem: PlanItem;
	features: Feature[];
}) =>
	planItem.included !== undefined &&
	!(planItem.included === 0 && isBooleanFeatureItem({ planItem, features }));

const isSimpleItem = ({
	planItem,
	features,
}: {
	planItem: PlanItem;
	features: Feature[];
}) =>
	!shouldEmitIncluded({ planItem, features }) &&
	planItem.unlimited !== true &&
	!planItem.reset &&
	!planItem.price &&
	!planItem.proration &&
	!planItem.rollover;

/**
 * Generate TypeScript code for a plan item configuration
 *
 * @param planItem The plan item to generate code for
 * @param features List of features (used for future variable name lookup)
 * @param featureVarMap Optional map of feature ID -> variable name for preserving local names
 */
export function buildPlanItemCode({
	planItem,
	features,
	featureVarMap,
	itemIndent = "\t\t",
}: {
	planItem: PlanItem;
	features: Feature[];
	featureVarMap?: Map<string, string>;
	itemIndent?: string;
}): string {
	// Use the variable map if provided, otherwise use string literal
	// This ensures generated code always works, even if variable names differ
	const featureVarName = featureVarMap?.get(planItem.featureId);
	const featureIdCode = featureVarName
		? `${featureVarName}.id`
		: `'${planItem.featureId}'`;
	const fieldIndent = `${itemIndent}\t`;
	const nestedIndent = `${fieldIndent}\t`;

	if (isSimpleItem({ planItem, features })) {
		return `${itemIndent}item({ featureId: ${featureIdCode} }),`;
	}

	const lines: string[] = [];
	lines.push(`${itemIndent}item({`);
	lines.push(`${fieldIndent}featureId: ${featureIdCode},`);

	// Add included (granted_balance)
	if (shouldEmitIncluded({ planItem, features })) {
		lines.push(`${fieldIndent}included: ${planItem.included},`);
	}

	// Add unlimited
	if (planItem.unlimited === true) {
		lines.push(`${fieldIndent}unlimited: true,`);
	}

	// Add reset object (nested)
	if (planItem.reset) {
		lines.push(`${fieldIndent}reset: {`);
		if (planItem.reset.interval) {
			lines.push(`${nestedIndent}interval: '${planItem.reset.interval}',`);
		}
		if (planItem.reset.intervalCount !== undefined) {
			lines.push(
				`${nestedIndent}intervalCount: ${planItem.reset.intervalCount},`,
			);
		}
		lines.push(`${fieldIndent}},`);
	}

	// Add price
	if (planItem.price) {
		lines.push(`${fieldIndent}price: {`);

		if (planItem.price.amount !== undefined) {
			lines.push(`${nestedIndent}amount: ${planItem.price.amount},`);
		}

		if (planItem.price.tiers) {
			const tiersCode = formatValue(planItem.price.tiers);
			lines.push(`${nestedIndent}tiers: ${tiersCode},`);
		}

		const priceWithBilling = planItem.price as {
			billingUnits?: number;
			billingMethod?: string;
			maxPurchase?: number;
			tierBehavior?: string;
		};

		if (priceWithBilling.billingUnits !== undefined) {
			lines.push(
				`${nestedIndent}billingUnits: ${priceWithBilling.billingUnits},`,
			);
		}

		if (priceWithBilling.billingMethod) {
			lines.push(
				`${nestedIndent}billingMethod: '${priceWithBilling.billingMethod}',`,
			);
		}

		if (priceWithBilling.maxPurchase !== undefined) {
			lines.push(
				`${nestedIndent}maxPurchase: ${priceWithBilling.maxPurchase},`,
			);
		}

		if (priceWithBilling.tierBehavior !== undefined) {
			lines.push(
				`${nestedIndent}tierBehavior: '${priceWithBilling.tierBehavior}',`,
			);
		}

		// Handle price.interval and price.intervalCount (from PriceWithInterval type)
		const priceWithInterval = planItem.price as {
			interval?: string;
			intervalCount?: number;
		};

		if (priceWithInterval.interval) {
			lines.push(`${nestedIndent}interval: '${priceWithInterval.interval}',`);
		}

		if (priceWithInterval.intervalCount !== undefined) {
			lines.push(
				`${nestedIndent}intervalCount: ${priceWithInterval.intervalCount},`,
			);
		}

		lines.push(`${fieldIndent}},`);
	}

	// Add proration
	if (planItem.proration) {
		lines.push(`${fieldIndent}proration: ${formatValue(planItem.proration)},`);
	}

	// Add rollover
	if (planItem.rollover) {
		lines.push(`${fieldIndent}rollover: ${formatValue(planItem.rollover)},`);
	}

	lines.push(`${itemIndent}}),`);

	return lines.join("\n");
}
