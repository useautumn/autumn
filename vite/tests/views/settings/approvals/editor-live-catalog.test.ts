/** Contract: rules are live, so in a sandbox dashboard the editor still offers live plans and features. */

import { describe, expect, mock, test } from "bun:test";

// Same module mocks as approvals-catalog.test.ts: bun shares mocks across files, so they must agree.
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

const { OPTION_HOOKS } = await import(
	"@/views/settings/sections/approvals/editor/values/useValueOptions"
);

describe("editor live catalog", () => {
	test("in sandbox, plan and feature options are the live ones", () => {
		expect(OPTION_HOOKS.catalog_plan()).toEqual([
			{ value: "credits_addon", label: "Credits add-on" },
		]);
		expect(OPTION_HOOKS.feature()).toEqual([
			{ value: "deployments", label: "Deployments" },
		]);
	});
});
