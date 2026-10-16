/**
 * Contract (E2 #5105): an enforced deny on a billing preview
 * disables submit and puts each matched condition on its field; a shadow-mode
 * deny, an allow or no `permission` leaves the sheet as it is. A 403
 * `permission_denied` reads its rule from `details` and never locks the retry.
 * Plan, feature and reward ids in violation values show as their live names.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { PermissionDenial as Denial } from "@/components/forms/shared/permission/permissionSchemas";
import { restoreQueryClientContext } from "../../../utils/restoreQueryClientContext";

await restoreQueryClientContext();

mock.module("@/hooks/queries/useRolesQuery", () => ({
	useRolesQuery: () => ({
		roles: [{ id: "rol_finance", name: "Finance" }],
		isLoading: false,
		error: null,
	}),
}));

const DENIAL_NAMES = {
	plan: { enterprise: "Enterprise", pro: "Pro" },
	feature: { ai_credits: "AI credits" },
	reward: { launch20: "Launch 20%" },
};
mock.module("@/components/forms/shared/permission/useDenialNames", () => ({
	useDenialNames: () => DENIAL_NAMES,
}));

const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { renderToStaticMarkup } = await import("react-dom/server");
const { BillingFooter } = await import(
	"@/components/forms/shared/BillingFooter"
);
const { PermissionDenial } = await import(
	"@/components/forms/shared/permission/PermissionDenial"
);
const { PermissionDenialProvider } = await import(
	"@/components/forms/shared/permission/PermissionDenialContext"
);
const { resolvePermissionDenial } = await import(
	"@/components/forms/shared/permission/resolvePermissionDenial"
);
const { violationsInSection } = await import(
	"@/components/forms/shared/permission/billingDenialSections"
);
const { formatAskRoles, formatViolation } = await import(
	"@/components/forms/shared/permission/formatDenial"
);
const { nameViolationIds } = await import(
	"@/components/forms/shared/permission/nameViolationIds"
);

const denial: Denial = {
	message: "Only Finance gives trials on Enterprise.",
	violations: [
		{
			field: "incoming[0].plan_id",
			label: "Plan",
			limit: "enterprise",
			actual: "enterprise",
		},
		{
			field: "billing_cycle_anchor",
			label: "Billing cycle anchor",
			limit: "custom",
			actual: "custom",
		},
		{
			field: "entity",
			label: "Entity",
			limit: "seats",
			actual: "seats",
		},
		{ field: "paid", label: "Charges customer", limit: true, actual: true },
	],
	decided_by: { level: "role", rule_id: "apr_1", rule_name: "Sales trials" },
	allowed_roles: ["rol_finance"],
};

const enforcedDeny = {
	total: 99,
	permission: { verdict: "deny", enforced: true, ...denial },
};
const shadowDeny = {
	total: 99,
	permission: { verdict: "deny", enforced: false, ...denial },
};
const allowed = {
	total: 99,
	permission: {
		verdict: "allow",
		enforced: true,
		decided_by: {
			level: "role",
			rule_id: "apr_2",
			rule_name: "Finance trials",
		},
	},
};
const noRule = { total: 99 };

const forbidden = (data: object) => ({
	isAxiosError: true,
	response: { status: 403, data },
});
const permissionDenied = forbidden({
	code: "permission_denied",
	message: denial.message,
	details: {
		violations: denial.violations,
		decided_by: denial.decided_by,
		allowed_roles: denial.allowed_roles,
	},
});

const render = ({
	preview,
	children,
}: {
	preview: unknown;
	children: React.ReactNode;
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
		["no permission", noRule, null],
		["an allow", allowed, null],
		["a shadow-mode deny", shadowDeny, null],
		["a non-permission 403", noRule, forbidden({ code: "forbidden" })],
		[
			"a 403 with fields at the top level",
			noRule,
			forbidden({ code: "permission_denied", env: "live", ...denial }),
		],
	])("%s is not a denial", (_name, preview, error) => {
		expect(resolvePermissionDenial({ preview, error })).toBeNull();
	});

	test("an enforced deny locks submit", () => {
		const resolved = resolvePermissionDenial({
			preview: enforcedDeny,
			error: null,
		});
		expect(resolved?.locksSubmit).toBe(true);
		expect(resolved?.denial.decided_by.rule_name).toBe("Sales trials");
	});

	test("a 403 reads details and leaves the retry enabled", () => {
		const resolved = resolvePermissionDenial({
			preview: noRule,
			error: permissionDenied,
		});
		expect(resolved?.locksSubmit).toBe(false);
		expect(resolved?.denial.message).toBe(denial.message);
		expect(resolved?.denial.violations).toHaveLength(4);
	});
});

describe("violations on their fields", () => {
	test.each([
		["plan", ["Plan", "Entity"]],
		["options", ["Billing cycle anchor"]],
		["summary", ["Charges customer"]],
	] as const)("%s holds %p", (section, labels) => {
		expect(
			violationsInSection({ denial, section }).map(({ label }) => label),
		).toEqual([...labels]);
	});

	test.each([
		["a matched value", denial.violations[0], "Plan: enterprise"],
		[
			"a comparison",
			{ field: "total", label: "Total", limit: "≥ 500", actual: "900" },
			"Total ≥ 500 (this request: 900)",
		],
		[
			"a list the request matched",
			{
				field: "incoming[0].plan_id",
				label: "Plan",
				limit: "pro or team",
				actual: "pro",
			},
			"Plan: pro or team (this request: pro)",
		],
		["a boolean", denial.violations[3], "Charges customer: yes"],
	])("formats %s", (_name, violation, expected) => {
		expect(formatViolation({ violation })).toBe(expected);
	});
});

describe("ids in violation values", () => {
	test.each([
		["a plan id", "incoming[0].plan_id", "enterprise", "Enterprise"],
		[
			"a plan list",
			"outgoing[0].plan_id",
			"pro or enterprise",
			"Pro or Enterprise",
		],
		["an excluded plan", "customer.plan", "not pro", "not Pro"],
		[
			"a feature id",
			"incoming[0].feature_quantities[0].feature_id",
			"ai_credits",
			"AI credits",
		],
		["a reward id", "discounts[0].reward_id", "launch20", "Launch 20%"],
		["an unknown id", "incoming[0].plan_id", "legacy", "legacy"],
		["a field without ids", "billing_cycle_anchor", "custom", "custom"],
	])("names %s", (_name, field, value, expected) => {
		const named = nameViolationIds({
			violation: { field, label: "Field", limit: value, actual: value },
			names: DENIAL_NAMES,
		});
		expect([named.limit, named.actual]).toEqual([expected, expected]);
	});

	test("a boolean stays a boolean", () => {
		const violation = {
			field: "paid",
			label: "Paid",
			limit: true,
			actual: true,
		};
		expect(nameViolationIds({ violation, names: DENIAL_NAMES })).toEqual(
			violation,
		);
	});

	test("the plan section shows the plan's name", () => {
		const html = render({
			preview: enforcedDeny,
			children: <PermissionDenial section="plan" />,
		});
		expect(html).toContain("Plan: Enterprise");
		expect(html).not.toContain("Plan: enterprise");
	});
});

describe("who to ask", () => {
	const roleName = (id: string) =>
		({ finance: "Finance", sales: "Sales" })[id] ?? id;

	test.each([
		[["finance"], "Ask someone with the Finance role"],
		[["finance", "sales"], "Ask someone with the Finance or Sales role"],
		[[], "Ask an owner or admin to change this rule"],
	])("%p", (allowed_roles, expected) => {
		expect(
			formatAskRoles({ denial: { ...denial, allowed_roles }, roleName }),
		).toBe(expected);
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

	test("an enforced deny disables submit and shows the summary", () => {
		const html = render({ preview: enforcedDeny, children: footer() });
		expect(html).toContain("<fieldset disabled=");
		expect(html).toContain("Sales trials");
		expect(html).toContain(denial.message);
		expect(html).toContain("Charges customer: yes");
		expect(html).toContain("Ask someone with the Finance role");
	});

	test.each([
		["no permission", noRule],
		["an allow", allowed],
		["a shadow-mode deny", shadowDeny],
	])("%s leaves the footer unchanged", (_name, preview) => {
		expect(render({ preview, children: footer() })).toBe(
			renderToStaticMarkup(footer()),
		);
	});

	test("an enforced deny leaves the invoice stage reachable", () => {
		const html = render({
			preview: enforcedDeny,
			children: (
				<BillingFooter
					layout="stacked"
					stageAction={<button type="button">Send an invoice</button>}
				>
					<button type="button">Attach</button>
				</BillingFooter>
			),
		});
		const locked = html.slice(html.indexOf("<fieldset disabled="));
		expect(locked).toContain("Attach");
		expect(locked).not.toContain("Send an invoice");
		expect(html).toContain("Send an invoice");
	});

	test("a field section renders only its violations", () => {
		const html = render({
			preview: enforcedDeny,
			children: <PermissionDenial section="options" />,
		});
		expect(html).toContain("Billing cycle anchor: custom");
		expect(html).not.toContain("Plan: Enterprise");
	});
});
