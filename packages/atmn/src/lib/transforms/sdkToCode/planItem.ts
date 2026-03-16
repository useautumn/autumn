import type { Feature, PlanItem } from "../../../compose/models/index.js";
import { formatValue } from "./helpers.js";

/**
 * Generate TypeScript code for a plan item configuration
 *
 * @param planItem The plan item to generate code for
 * @param features List of features (used for future variable name lookup)
 * @param featureVarMap Optional map of feature ID -> variable name for preserving local names
 */
export function buildPlanItemCode(
	planItem: PlanItem,
	_features: Feature[],
	featureVarMap?: Map<string, string>,
): string {
	// Use the variable map if provided, otherwise use string literal
	// This ensures generated code always works, even if variable names differ
	const featureVarName = featureVarMap?.get(planItem.featureId);
	const featureIdCode = featureVarName
		? `${featureVarName}.id`
		: `'${planItem.featureId}'`;

	const lines: string[] = [];
	lines.push(`\t\titem({`);
	lines.push(`\t\t\tfeatureId: ${featureIdCode},`);

	// Add included (granted_balance)
	if (planItem.included !== undefined) {
		lines.push(`\t\t\tincluded: ${planItem.included},`);
	}

	// Add unlimited
	if (planItem.unlimited === true) {
		lines.push(`\t\t\tunlimited: true,`);
	}

	// Add reset object (nested)
	if (planItem.reset) {
		lines.push(`\t\t\treset: {`);
		if (planItem.reset.interval) {
			lines.push(`\t\t\t\tinterval: '${planItem.reset.interval}',`);
		}
		if (planItem.reset.intervalCount !== undefined) {
			lines.push(
				`\t\t\t\tintervalCount: ${planItem.reset.intervalCount},`,
			);
		}
		lines.push(`\t\t\t},`);
	}

	// Add price
	if (planItem.price) {
		lines.push(`\t\t\tprice: {`);

		if (planItem.price.amount !== undefined) {
			lines.push(`\t\t\t\tamount: ${planItem.price.amount},`);
		}

		if (planItem.price.tiers) {
			const tiersCode = formatValue(planItem.price.tiers);
			lines.push(`\t\t\t\ttiers: ${tiersCode},`);
		}

		const priceWithBilling = planItem.price as {
			billingUnits?: number;
			billingMethod?: string;
			maxPurchase?: number;
			tierBehavior?: string;
		};

		if (priceWithBilling.billingUnits !== undefined) {
			lines.push(`\t\t\t\tbillingUnits: ${priceWithBilling.billingUnits},`);
		}

		if (priceWithBilling.billingMethod) {
			lines.push(
				`\t\t\t\tbillingMethod: '${priceWithBilling.billingMethod}',`,
			);
		}

		if (priceWithBilling.maxPurchase !== undefined) {
			lines.push(`\t\t\t\tmaxPurchase: ${priceWithBilling.maxPurchase},`);
		}

		if (priceWithBilling.tierBehavior !== undefined) {
			lines.push(`\t\t\t\ttierBehavior: '${priceWithBilling.tierBehavior}',`);
		}

		// Handle price.interval and price.intervalCount (from PriceWithInterval type)
		const priceWithInterval = planItem.price as {
			interval?: string;
			intervalCount?: number;
		};

		if (priceWithInterval.interval) {
			lines.push(`\t\t\t\tinterval: '${priceWithInterval.interval}',`);
		}

		if (priceWithInterval.intervalCount !== undefined) {
			lines.push(
				`\t\t\t\tintervalCount: ${priceWithInterval.intervalCount},`,
			);
		}

		lines.push(`\t\t\t},`);
	}

	// Add proration
	if (planItem.proration) {
		lines.push(`\t\t\tproration: ${formatValue(planItem.proration)},`);
	}

	// Add rollover
	if (planItem.rollover) {
		lines.push(`\t\t\trollover: ${formatValue(planItem.rollover)},`);
	}

	lines.push(`\t\t}),`);

	return lines.join("\n");
}
