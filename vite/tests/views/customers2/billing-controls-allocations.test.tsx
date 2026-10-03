import { expect, test } from "bun:test";
import { EntInterval, type FullCustomer, ResetInterval } from "@autumn/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingControlsList } from "@/components/billing-controls/BillingControlsDisplay";
import { fullCustomerToBalanceAllocationControls } from "@/views/customers2/components/fullCustomerToBalanceAllocationControls";

const creditsAllocation = {
	feature_id: "credits",
	interval: ResetInterval.Month,
	allocations: [
		{ entity_id: "workspace_a", amount: 300 },
		{ entity_id: "workspace_b", amount: 200 },
	],
};

test("saved allocations render as a line in their feature row", () => {
	const html = renderToStaticMarkup(
		<BillingControlsList
			balanceAllocations={[creditsAllocation]}
			featureNameById={new Map([["credits", "AI Credits"]])}
			defaultExpanded
		/>,
	);
	expect(html).toContain("AI Credits");
	expect(html).toContain("Balance Allocation");
	expect(html).toContain("Month");
	expect(html).toContain("2 Allocations · 500 Total Allocated");
});

test("allocations fall back to the feature id when its name is unavailable", () => {
	const html = renderToStaticMarkup(
		<BillingControlsList
			balanceAllocations={[
				{
					...creditsAllocation,
					allocations: [creditsAllocation.allocations[0]],
				},
			]}
			featureNameById={new Map()}
			defaultExpanded
		/>,
	);
	expect(html).toContain("credits");
	expect(html).toContain("1 Allocation · 300 Total Allocated");
});

test("no allocations and no controls shows the empty state", () => {
	const html = renderToStaticMarkup(
		<BillingControlsList balanceAllocations={[]} featureNameById={new Map()} />,
	);
	expect(html).toContain("No billing controls configured");
});

test("stored allocations map internal entity ids to public ids and drop unknown entities", () => {
	const fullCustomer = {
		entities: [
			{ internal_id: "ent_internal_a", id: "workspace_a" },
			{ internal_id: "ent_internal_b", id: null },
		],
		balance_allocations: {
			feature_internal_credits: {
				feature_id: "credits",
				interval: EntInterval.Month,
				scale: 1,
				amounts: { ent_internal_a: 300, ent_internal_b: 200, ent_gone: 50 },
			},
		},
	} as unknown as FullCustomer;

	expect(fullCustomerToBalanceAllocationControls({ fullCustomer })).toEqual([
		{
			feature_id: "credits",
			interval: ResetInterval.Month,
			allocations: [{ entity_id: "workspace_a", amount: 300 }],
		},
	]);
});
