/** Export must refetch per org and sandbox, never reuse another scope's catalog. */

import { expect, mock, test } from "bun:test";

let activeScope = { orgId: "org_a", sandboxId: null as string | null };
const queryKeys: unknown[][] = [];

mock.module("@tanstack/react-query", () => ({
	useQuery: (options: { queryKey: unknown[] }) => {
		queryKeys.push(options.queryKey);
		return { data: undefined, isLoading: false, error: null };
	},
}));

mock.module("@/hooks/common/useQueryKeyFactory", () => ({
	useQueryKeyFactory: () => (key: unknown[]) => [
		...key,
		"sandbox",
		activeScope.orgId,
		activeScope.sandboxId,
	],
}));

mock.module("@/services/useAxiosInstance", () => ({
	useAxiosInstance: () => ({}),
}));

const { useCatalogExportQuery } = await import(
	"@/views/products/catalog-transfer/hooks/useCatalogExportQuery"
);

test("keys the export query by org and sandbox", () => {
	useCatalogExportQuery({ enabled: true });
	activeScope = { orgId: "org_b", sandboxId: null };
	useCatalogExportQuery({ enabled: true });
	activeScope = { orgId: "org_b", sandboxId: "sbx_1" };
	useCatalogExportQuery({ enabled: true });

	const [orgA, orgB, orgBSandbox] = queryKeys.map((key) => JSON.stringify(key));
	expect(orgA).toContain("org_a");
	expect(orgB).toContain("org_b");
	expect(new Set([orgA, orgB, orgBSandbox]).size).toBe(3);
});
