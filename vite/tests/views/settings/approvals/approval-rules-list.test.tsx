/**
 * Contract: the Approvals list says when rules failed to load instead of
 * showing the empty state, and in sandbox it says the rules shown are live.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ApprovalRulesList } from "@/views/settings/sections/approvals/ApprovalRulesList";

const render = ({
	error = null,
	isSandbox = false,
}: {
	error?: Error | null;
	isSandbox?: boolean;
}) =>
	renderToStaticMarkup(
		<ApprovalRulesList rules={[]} error={error} isSandbox={isSandbox} />,
	);

describe("approval rules list states", () => {
	test("a failed load shows an error, not the empty state", () => {
		const html = render({ error: new Error("boom") });
		expect(html).toContain("Couldn&#x27;t load rules");
		expect(html).not.toContain("No rules yet");
	});

	test("no rules shows the empty state", () => {
		expect(render({})).toContain("No rules yet");
	});

	test("sandbox says the rules shown are live", () => {
		expect(render({ isSandbox: true })).toContain(
			"These are your live rules. Sandbox is never restricted.",
		);
		expect(render({})).not.toContain("These are your live rules");
	});
});
