/**
 * Contract (PRD decisions 5 and 13): `POST /approvals.can { action }` gates the
 * buttons that open billing sheets on `can` alone. `blocked` and `none` hide
 * them; an unanswered or failed check never does.
 */

import { describe, expect, mock, test } from "bun:test";

mock.module("@/hooks/common/useQueryKeyFactory", () => ({
	useQueryKeyFactory: () => (key: readonly unknown[]) => key,
}));
mock.module("@/services/useAxiosInstance", () => ({
	useAxiosInstance: () => ({}),
}));
mock.module(
	"@/views/customers2/components/sheets/set-plans-subscription/hooks/useOpenSetPlans",
	() => ({ useOpenSetPlans: () => () => {} }),
);
mock.module(
	"@/views/customers2/components/sheets/set-plans-subscription/hooks/usePrefetchSetPlans",
	() => ({ usePrefetchSetPlans: () => {} }),
);

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { canDoAllows, fetchCanDo } = await import(
	"@/components/forms/shared/permission/canDo"
);
const { canDoQueryKey } = await import("@/hooks/queries/useCanDo");
const { AttachProductSheetTrigger } = await import(
	"@/views/customers2/components/table/customer-products/AttachProductSheetTrigger"
);

type CanDo = { can: boolean; reason: "scope" | "blocked" | "none" };

describe("canDoAllows gates on can alone", () => {
	test.each([
		["the scope allows", { can: true, reason: "scope" }, true],
		["a rule always blocks", { can: false, reason: "blocked" }, false],
		["no scope", { can: false, reason: "none" }, false],
		["not answered", undefined, true],
	] as const)("%s", (_name, response, expected) => {
		expect(canDoAllows({ response })).toBe(expected);
	});
});

test("fetchCanDo posts approvals.can with the action in the body", async () => {
	const calls: unknown[][] = [];
	const axios = {
		post: async (...args: unknown[]) => {
			calls.push(args);
			return { data: { can: true, reason: "scope" } };
		},
	};
	const response = await fetchCanDo({
		axios: axios as never,
		action: "billing.attach",
	});
	expect(calls).toEqual([["/approvals.can", { action: "billing.attach" }]]);
	expect(response).toEqual({ can: true, reason: "scope" });
});

const renderTrigger = ({
	attach,
	setPlans,
	failedRefresh = false,
}: {
	attach?: CanDo;
	setPlans?: CanDo;
	failedRefresh?: boolean;
}) => {
	const client = new QueryClient();
	const seed = (
		action: "billing.attach" | "billing.set_plans",
		value?: CanDo,
	) => {
		if (!value) return;
		client.setQueryData(canDoQueryKey(action), value);
		if (!failedRefresh) return;
		client
			.getQueryCache()
			.find({ queryKey: canDoQueryKey(action) })
			?.setState({ status: "error", error: new Error("refresh failed") });
	};
	seed("billing.attach", attach);
	seed("billing.set_plans", setPlans);
	return renderToStaticMarkup(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(AttachProductSheetTrigger),
		),
	);
};

const allowed: CanDo = { can: true, reason: "scope" };
const blocked: CanDo = { can: false, reason: "blocked" };

describe("attach trigger", () => {
	test("shows attach and set plans when both are allowed", () => {
		const html = renderTrigger({ attach: allowed, setPlans: allowed });
		expect(html).toContain("Attach Plan");
		expect(html).toContain('aria-label="More plan actions"');
	});

	test("hides set plans when only set plans is blocked", () => {
		const html = renderTrigger({ attach: allowed, setPlans: blocked });
		expect(html).toContain("Attach Plan");
		expect(html).not.toContain('aria-label="More plan actions"');
	});

	test("keeps set plans alone when only attach is blocked", () => {
		const html = renderTrigger({ attach: blocked, setPlans: allowed });
		expect(html).not.toContain("Attach Plan");
		expect(html).toContain("Set Plans");
	});

	test("hides the trigger without the scope", () => {
		const none: CanDo = { can: false, reason: "none" };
		expect(renderTrigger({ attach: none, setPlans: none })).toBe("");
	});

	test("keeps both while the check hasn't answered", () => {
		const html = renderTrigger({});
		expect(html).toContain("Attach Plan");
		expect(html).toContain('aria-label="More plan actions"');
	});

	test("a failed refresh after a block shows the actions again", () => {
		const html = renderTrigger({
			attach: blocked,
			setPlans: blocked,
			failedRefresh: true,
		});
		expect(html).toContain("Attach Plan");
		expect(html).toContain('aria-label="More plan actions"');
	});
});
