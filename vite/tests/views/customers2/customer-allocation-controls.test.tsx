import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerAllocationControls } from "@/views/customers2/components/CustomerAllocationControls";

test("saved customer allocations show their feature, interval and requested entity amounts", () => {
	const html = renderToStaticMarkup(
		<CustomerAllocationControls
			controls={[
				{
					feature_id: "credits",
					interval: ResetInterval.Month,
					allocations: [
						{ entity_id: "workspace_a", amount: 300 },
						{ entity_id: "workspace_b", amount: 200 },
					],
				},
			]}
			featureNameById={new Map([["credits", "AI Credits"]])}
			onEdit={() => {}}
		/>,
	);
	expect(html).toContain("Balance allocations");
	expect(html).toContain("AI Credits");
	expect(html).toContain("2 entities · every month");
	expect(html).toContain("workspace_a: 300 · workspace_b: 200");
	expect(html).toContain('aria-label="Edit AI Credits balance allocations"');
});

test("saved allocations retain an edit entry when a feature name is unavailable", () => {
	const html = renderToStaticMarkup(
		<CustomerAllocationControls
			controls={[
				{
					feature_id: "credits",
					interval: ResetInterval.Month,
					allocations: [{ entity_id: "workspace_a", amount: 300 }],
				},
			]}
			featureNameById={new Map()}
			onEdit={() => {}}
		/>,
	);
	expect(html).toContain('aria-label="Edit credits balance allocations"');
	expect(html).toContain("1 entity · every month");
});

test("released allocations do not leave an empty allocation group", () => {
	expect(
		renderToStaticMarkup(
			<CustomerAllocationControls
				controls={[]}
				featureNameById={new Map()}
				onEdit={() => {}}
			/>,
		),
	).toBe("");
});
