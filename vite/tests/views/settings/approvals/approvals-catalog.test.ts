/**
 * Contract: rules are always live, so the Approvals UI reads plans and features
 * from live even when the dashboard is in sandbox.
 */

import { expect, mock, test } from "bun:test";
import type { QueryClient } from "@tanstack/react-query";

const CATALOG: Record<string, { products: object[]; features: object[] }> = {
	live: {
		products: [{ id: "credits_addon", name: "Credits add-on" }],
		features: [{ id: "deployments", name: "Deployments" }],
	},
	sandbox: { products: [], features: [] },
};

// bun keeps module mocks for the whole run, so every mock spreads the real module.
const actualQuery = await import("@tanstack/react-query");
const actualEnv = await import("@/utils/envUtils");
const actualKeys = await import("@/hooks/common/useQueryKeyFactory");
const actualPersistence = await import("@/lib/queryPersistence");
const actualAxios = await import("@/services/useAxiosInstance");
const fallbackClient = new actualQuery.QueryClient();

mock.module("@/utils/envUtils", () => ({
	...actualEnv,
	useEnv: () => "sandbox",
}));

mock.module("@/hooks/common/useQueryKeyFactory", () => ({
	...actualKeys,
	useQueryKeyFactory: (params?: { env?: string }) => (key: unknown[]) => [
		...key,
		params?.env ?? "sandbox",
	],
}));

mock.module("@/lib/queryPersistence", () => ({
	...actualPersistence,
	PERSIST_META: {},
}));

mock.module("@/services/useAxiosInstance", () => ({
	...actualAxios,
	useAxiosInstance: () => ({}),
}));

mock.module("@tanstack/react-query", () => ({
	...actualQuery,
	// Later files render their own provider; only fall back when there isn't one.
	useQueryClient: (client?: QueryClient) => {
		try {
			return actualQuery.useQueryClient(client);
		} catch {
			return fallbackClient;
		}
	},
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
