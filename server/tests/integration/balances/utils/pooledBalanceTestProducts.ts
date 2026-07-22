import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";

export const pooledBalanceTestValues = {
	freeContribution: 50,
	prepaidQuantity: 600,
	proContribution: 100,
	overagePrice: 0.01,
} as const;

export const buildPooledBalanceTestProducts = ({
	idPrefix,
}: {
	idPrefix: string;
}) => {
	const entityPlanGroup = `${idPrefix}-entity-plan`;
	const customerAddon = products.base({
		id: `${idPrefix}-customer-addon`,
		isAddOn: true,
		items: [
			items.volumePrepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
				tiers: [
					{ to: 500, amount: 10 },
					{ to: "inf", amount: 5 },
				],
			}),
			items.consumableMessages({
				includedUsage: 0,
				price: pooledBalanceTestValues.overagePrice,
			}),
		],
	});
	const freeEntityPlan = products.base({
		id: `${idPrefix}-free`,
		group: entityPlanGroup,
		items: [
			{
				...items.monthlyMessages({
					includedUsage: pooledBalanceTestValues.freeContribution,
				}),
				pooled: true,
			},
		],
	});
	const proEntityPlan = products.pro({
		id: `${idPrefix}-pro`,
		group: entityPlanGroup,
		items: [
			{
				...items.monthlyMessages({
					includedUsage: pooledBalanceTestValues.proContribution,
				}),
				pooled: true,
			},
		],
	});

	return { customerAddon, freeEntityPlan, proEntityPlan };
};
