/**
 * Contract (approvals-api-schema §R, E3): `GET /approvals/can` gates the
 * buttons that open billing sheets. `exempt` and `none` count as allowed, and
 * an unanswered check never hides a button.
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
const { canDoAllows } = await import(
	"@/components/forms/shared/permission/permissionDenialUtils"
);
const { canDoQueryKey } = await import("@/hooks/queries/useCanDo");
const { AttachProductSheetTrigger } = await import(
	"@/views/customers2/components/table/customer-products/AttachProductSheetTrigger"
);

type CanDo = { can: boolean; reason: "rule" | "scope" | "exempt" | "none" };

describe("canDoAllows", () => {
	test.each([
		[{ can: true, reason: "rule" }, true],
		[{ can: true, reason: "scope" }, true],
		[{ can: false, reason: "rule" }, false],
		[{ can: false, reason: "scope" }, false],
		[{ can: false, reason: "exempt" }, true],
		[{ can: false, reason: "none" }, true],
		[undefined, true],
	] as const)("%p → %p", (response, expected) => {
		expect(canDoAllows({ response })).toBe(expected);
	});
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

const allowed: CanDo = { can: true, reason: "rule" };
const denied: CanDo = { can: false, reason: "scope" };

describe("attach trigger", () => {
	test("shows attach and set plans when both are allowed", () => {
		const html = renderTrigger({ attach: allowed, setPlans: allowed });
		expect(html).toContain("Attach Plan");
		expect(html).toContain('aria-label="More plan actions"');
	});

	test("hides set plans when only set plans is denied", () => {
		const html = renderTrigger({ attach: allowed, setPlans: denied });
		expect(html).toContain("Attach Plan");
		expect(html).not.toContain('aria-label="More plan actions"');
	});

	test("keeps set plans alone when only attach is denied", () => {
		const html = renderTrigger({ attach: denied, setPlans: allowed });
		expect(html).not.toContain("Attach Plan");
		expect(html).toContain("Set Plans");
	});

	test("hides the trigger when both are denied", () => {
		expect(renderTrigger({ attach: denied, setPlans: denied })).toBe("");
	});

	test("keeps both while the check hasn't answered", () => {
		const html = renderTrigger({});
		expect(html).toContain("Attach Plan");
		expect(html).toContain('aria-label="More plan actions"');
	});

	test("a failed refresh after a denial shows the actions again", () => {
		const html = renderTrigger({
			attach: denied,
			setPlans: denied,
			failedRefresh: true,
		});
		expect(html).toContain("Attach Plan");
		expect(html).toContain('aria-label="More plan actions"');
	});
});
