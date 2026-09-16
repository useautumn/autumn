import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ItemEventStatusBadge } from "./RunStatusBadge";

test("skipped badge reads the structured reason", () => {
	expect(
		renderToStaticMarkup(
			<ItemEventStatusBadge status="skipped" skipReason="ineligible" />,
		),
	).toContain("Skipped (ineligible)");
	expect(
		renderToStaticMarkup(
			<ItemEventStatusBadge status="skipped" skipReason="no_updates_needed" />,
		),
	).toContain("No Changes");
});

test("skipped badge falls back to the event response reason", () => {
	expect(
		renderToStaticMarkup(
			<ItemEventStatusBadge
				status="skipped"
				response={{ skip_reason: "ineligible" }}
			/>,
		),
	).toContain("Skipped (ineligible)");
});

test("succeeded and failed badges keep their labels", () => {
	expect(
		renderToStaticMarkup(<ItemEventStatusBadge status="succeeded" />),
	).toContain("Passed");
	expect(
		renderToStaticMarkup(<ItemEventStatusBadge status="failed" />),
	).toContain("Failed");
});
