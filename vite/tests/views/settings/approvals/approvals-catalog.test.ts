/**
 * Contract: rules are always live, so the Approvals UI reads plans and features
 * from live even when the dashboard is in sandbox.
 */

import { expect, mock, test } from "bun:test";

const CATALOG: Record<string, { products: object[]; features: object[] }> = {
	live: {
		products: [{ id: "credits_addon", name: "Credits add-on" }],
		features: [{ id: "deployments", name: "Deployments" }],
	},
	sandbox: { products: [], features: [] },
};

mock.module("@/utils/envUtils", () => ({ useEnv: () => "sandbox" }));

mock.module("@/hooks/common/useQueryKeyFactory", () => ({
	useQueryKeyFactory: (params?: { env?: string }) => (key: unknown[]) => [
		...key,
		params?.env ?? "sandbox",
	],
}));

mock.module("@/lib/queryPersistence", () => ({ PERSIST_META: {} }));

mock.module("@/services/useAxiosInstance", () => ({
	useAxiosInstance: () => ({}),
}));

mock.module("@tanstack/react-query", () => ({
	useQueryClient: () => ({}),
	useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
		const catalog = CATALOG[String(queryKey.at(-1))];
		const isFeatures = queryKey[0] === "features";
		return {
			data: isFeatures
				? { features: catalog.features }
				: { products: catalog.products },
			isLoading: false,
			error: null,
			refetch: async () => {},
		};
	},
}));

const { useApprovalsCatalog } = await import(
	"@/views/settings/sections/approvals/useApprovalsCatalog"
);

test("in sandbox, a live-only plan and feature still resolve to their names", () => {
	const { products, features } = useApprovalsCatalog();
	expect(products.map((product) => product.name)).toEqual(["Credits add-on"]);
	expect(features.map((feature) => feature.name)).toEqual(["Deployments"]);
});
