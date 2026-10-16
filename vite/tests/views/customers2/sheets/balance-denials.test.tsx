/**
 * Contract (E5a): a 403 `permission_denied` from Grant credits or Set balance
 * shows the summary and puts each violation beside its field, without locking
 * the retry. Other errors render nothing.
 */

import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import type { PermissionDenial as Denial } from "@/components/forms/shared/permission/permissionSchemas";

mock.module("@/hooks/queries/useRolesQuery", () => ({
	useRolesQuery: () => ({
		roles: [{ id: "finance", name: "Finance" }],
		isLoading: false,
		error: null,
	}),
}));

const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { renderToStaticMarkup } = await import("react-dom/server");
const { violationsInSection } = await import(
	"@/components/forms/shared/permission/billingDenialSections"
);
const { PermissionDenial } = await import(
	"@/components/forms/shared/permission/PermissionDenial"
);
const { PermissionDenialProvider } = await import(
	"@/components/forms/shared/permission/PermissionDenialContext"
);
const { BALANCE_DENIAL_SECTIONS, BALANCE_WRITE_KEY } = await import(
	"@/views/customers2/components/sheets/useBalanceWrite"
);

const denial: Denial = {
	message: "Sales can grant up to 50 AI credits.",
	violations: [
		{
			field: "included_grant",
			label: "Amount",
			operator: "≤",
			limit: 50,
			actual: 200,
		},
		{
			field: "feature_id",
			label: "Feature",
			limit: "ai_credits",
			actual: "messages",
		},
		{ field: "customer.id", label: "Customer", limit: "acme", actual: "x" },
	],
	decided_by: { level: "role", rule_id: "apr_1", rule_name: "Sales grants" },
	allowed_roles: ["finance"],
};

const permissionDenied = {
	isAxiosError: true,
	response: {
		status: 403,
		data: {
			code: "permission_denied",
			env: "live",
			message: denial.message,
			details: {
				violations: denial.violations,
				decided_by: denial.decided_by,
				allowed_roles: denial.allowed_roles,
			},
		},
	},
};

const renderWithFailedWrite = ({
	error,
	children,
}: {
	error: unknown;
	children: ReactNode;
}) => {
	const client = new QueryClient();
	client.getMutationCache().build(
		client,
		{ mutationKey: BALANCE_WRITE_KEY },
		{
			context: undefined,
			data: undefined,
			error,
			failureCount: 1,
			failureReason: null,
			isPaused: false,
			status: "error",
			variables: undefined,
			submittedAt: 1,
		},
	);
	return renderToStaticMarkup(
		<QueryClientProvider client={client}>
			<PermissionDenialProvider
				preview={undefined}
				mutationKey={BALANCE_WRITE_KEY}
				sections={BALANCE_DENIAL_SECTIONS}
			>
				{children}
			</PermissionDenialProvider>
		</QueryClientProvider>,
	);
};

describe("balance violations on their fields", () => {
	test.each([
		["grant", ["Amount"]],
		["feature", ["Feature"]],
		["summary", ["Customer"]],
	] as const)("%s holds %p", (section, labels) => {
		expect(
			violationsInSection({
				denial,
				section,
				sections: BALANCE_DENIAL_SECTIONS,
			}).map(({ label }) => label),
		).toEqual([...labels]);
	});
});

describe("a failed balance write", () => {
	test("a 403 shows the field violation and the summary", () => {
		const html = renderWithFailedWrite({
			error: permissionDenied,
			children: (
				<>
					<PermissionDenial section="grant" />
					<PermissionDenial section="summary" />
				</>
			),
		});
		expect(html).toContain("Amount ≤ 50 (this request: 200)");
		expect(html).toContain("Sales grants");
		expect(html).toContain(denial.message);
		expect(html).toContain("Ask someone with the Finance role");
		expect(html).not.toContain("Feature");
	});

	test("any other error renders nothing", () => {
		const html = renderWithFailedWrite({
			error: { response: { status: 400, data: { code: "invalid" } } },
			children: <PermissionDenial section="summary" />,
		});
		expect(html).toBe("");
	});
});
