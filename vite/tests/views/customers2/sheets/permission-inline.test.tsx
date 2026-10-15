/**
 * Contract (approvals-api-schema §3): a deny verdict on a billing preview
 * disables submit and puts each violation on its field; no field or an allow
 * verdict leaves the sheet as it is today. A 403 `permission_denied` on submit
 * renders the same way.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingFooter } from "@/components/forms/shared/BillingFooter";
import { PermissionDenial } from "@/components/forms/shared/permission/PermissionDenial";
import { PermissionDenialProvider } from "@/components/forms/shared/permission/PermissionDenialContext";
import {
	formatViolation,
	resolvePermissionDenial,
	violationsInSection,
} from "@/components/forms/shared/permission/permissionDenialUtils";

const denyPermission = {
	verdict: "deny",
	message: "Sales can approve trials up to 31 days that never charge.",
	violations: [
		{
			field: "incoming[0].free_trial",
			label: "Free trial",
			limit: "31 days",
			actual: "45 days",
		},
		{
			field: "discounts[1].percent_off",
			label: "Percent off",
			limit: "at most 20%",
			actual: "30%",
		},
		{ field: "paid", label: "Charges customer", limit: false, actual: true },
	],
	decided_by: { level: "role", rule_id: "apr_1", rule_name: "Sales trials" },
	allowed_roles: ["finance", "owner", "admin"],
};

const deniedPreview = { total: 99, permission: denyPermission };
const allowedPreview = {
	total: 0,
	permission: { verdict: "allow", decided_by: null },
};
const noRulePreview = { total: 99 };

const permissionDeniedError = {
	isAxiosError: true,
	response: {
		status: 403,
		data: { code: "permission_denied", ...denyPermission },
	},
};

const render = ({
	preview,
	children,
}: {
	preview: unknown;
	children: ReactNode;
}) =>
	renderToStaticMarkup(
		<QueryClientProvider client={new QueryClient()}>
			<PermissionDenialProvider preview={preview}>
				{children}
			</PermissionDenialProvider>
		</QueryClientProvider>,
	);

const footer = () => (
	<BillingFooter layout="single">
		<button type="button">Attach</button>
	</BillingFooter>
);

describe("resolvePermissionDenial", () => {
	test.each([
		["a missing field", noRulePreview, null, null],
		["an allow verdict", allowedPreview, null, null],
		[
			"a non-permission 403",
			noRulePreview,
			{ response: { status: 403, data: { code: "forbidden" } } },
			null,
		],
	])("%s is not a denial", (_name, preview, error, expected) => {
		expect(resolvePermissionDenial({ preview, error })).toBe(expected);
	});

	test("a denied preview locks submit", () => {
		const resolved = resolvePermissionDenial({
			preview: deniedPreview,
			error: null,
		});
		expect(resolved?.locksSubmit).toBe(true);
		expect(resolved?.denial.decided_by.rule_name).toBe("Sales trials");
	});

	test("a 403 on submit shows the denial without locking the retry", () => {
		const resolved = resolvePermissionDenial({
			preview: noRulePreview,
			error: permissionDeniedError,
		});
		expect(resolved?.locksSubmit).toBe(false);
		expect(resolved?.denial.violations).toHaveLength(3);
	});
});

describe("violations on their fields", () => {
	const denial = resolvePermissionDenial({
		preview: deniedPreview,
		error: null,
	})?.denial;
	if (!denial) throw new Error("expected a denial");

	test.each([
		["plan", ["Free trial"]],
		["options", ["Percent off"]],
		["summary", ["Charges customer"]],
	] as const)("%s section holds %p", (section, labels) => {
		expect(
			violationsInSection({ denial, section }).map(({ label }) => label),
		).toEqual([...labels]);
	});

	test.each([
		[
			denyPermission.violations[0],
			"Free trial: limit 31 days, you entered 45 days",
		],
		[
			denyPermission.violations[2],
			"Charges customer: limit no, you entered yes",
		],
	])("formats %p", (violation, expected) => {
		expect(formatViolation({ violation })).toBe(expected);
	});

	test("a field section renders only its violations", () => {
		const html = render({
			preview: deniedPreview,
			children: <PermissionDenial section="plan" />,
		});
		expect(html).toContain("Free trial: limit 31 days, you entered 45 days");
		expect(html).not.toContain("Percent off");
	});
});

describe("billing footer", () => {
	// Another suite's stub `window` makes motion attach DOM listeners during SSR.
	const stubWindow = globalThis.window;
	beforeAll(() => {
		Reflect.deleteProperty(globalThis, "window");
	});
	afterAll(() => {
		if (stubWindow) globalThis.window = stubWindow;
	});

	test("a denied preview disables submit and shows the summary", () => {
		const html = render({ preview: deniedPreview, children: footer() });
		expect(html).toContain("<fieldset disabled=");
		expect(html).toContain("Sales trials");
		expect(html).toContain(denyPermission.message);
		expect(html).toContain("Charges customer: limit no, you entered yes");
		expect(html).toContain("Ask an owner, admin or finance");
	});

	test.each([
		["a missing field", noRulePreview],
		["an allow verdict", allowedPreview],
	])("%s leaves the footer unchanged", (_name, preview) => {
		expect(render({ preview, children: footer() })).toBe(
			renderToStaticMarkup(footer()),
		);
	});
});
