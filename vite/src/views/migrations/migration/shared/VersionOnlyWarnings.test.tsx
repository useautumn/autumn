import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { versionWarningText } from "./operationUtils";
import { VersionOnlyWarnings } from "./VersionOnlyWarnings";

const planFilter = { plan_id: "pro" };

test("a version-only update_plan renders the warning for its target version", () => {
	const markup = renderToStaticMarkup(
		<VersionOnlyWarnings
			operations={{
				customer: [
					{ type: "update_plan", plan_filter: planFilter, version: 3 },
				],
			}}
		/>,
	);
	expect(markup).toContain(versionWarningText(3));
});

test("version plus customize renders nothing", () => {
	const markup = renderToStaticMarkup(
		<VersionOnlyWarnings
			operations={{
				customer: [
					{
						type: "update_plan",
						plan_filter: planFilter,
						version: 3,
						customize: { add_items: [{ feature_id: "dashboard" }] },
					},
				],
			}}
		/>,
	);
	expect(markup).toBe("");
});
