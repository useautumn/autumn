import { expect, mock, test } from "bun:test";
import type { FullCustomer } from "@autumn/shared";

const scope = ["sandbox", "org_123", null];

mock.module("@/hooks/common/useQueryKeyFactory", () => ({
	useQueryKeyFactory: () => (key: unknown[]) => [...key, ...scope],
}));
mock.module("@/hooks/stores/useSubscriptionStore", () => ({
	useEntity: () => ({ entityId: "workspace_a", setEntityId: () => {} }),
}));
mock.module("@/services/useAxiosInstance", () => ({
	useAxiosInstance: () => ({ get: () => new Promise(() => {}) }),
}));
mock.module("@/hooks/queries/useProductsQuery", () => ({
	useProductsQuery: () => ({ products: [], isLoading: false }),
}));
mock.module("@/hooks/queries/useFeaturesQuery", () => ({
	useFeaturesQuery: () => ({ features: [], isLoading: false }),
}));
mock.module(
	"@/views/customers/customer/hooks/useCustomerScheduleQueryOptions",
	() => ({
		useCustomerScheduleQueryOptions: () => ({
			queryKey: ["schedule"],
			queryFn: () => null,
			enabled: false,
		}),
	}),
);

const { renderToStaticMarkup } = await import("react-dom/server");
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { MemoryRouter, Route, Routes } = await import("react-router");
const { NuqsTestingAdapter } = await import("nuqs/adapters/testing");
// The query suffix bypasses other test files that mock.module useCusQuery.
const { useCusQuery } = await import(
	"@/views/customers/customer/hooks/useCusQuery.tsx?unmocked"
);

const customer = {
	id: "customer_123",
	name: "Example Customer",
	customer_products: [],
	entities: [],
} as unknown as FullCustomer;

const CustomerName = () => {
	const { customer } = useCusQuery();
	return <span>{customer?.name ?? "missing"}</span>;
};

const renderWithCache = (
	queryKey: unknown[],
	{ refreshFailed = false }: { refreshFailed?: boolean } = {},
) => {
	const queryClient = new QueryClient();
	queryClient.setQueryData(queryKey, { customer });
	if (refreshFailed) {
		queryClient
			.getQueryCache()
			.find({ queryKey })
			?.setState({ status: "error", error: new Error("refresh failed") });
	}
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<NuqsTestingAdapter>
				<MemoryRouter initialEntries={["/customers/customer_123"]}>
					<Routes>
						<Route path="/customers/:customer_id" element={<CustomerName />} />
					</Routes>
				</MemoryRouter>
			</NuqsTestingAdapter>
		</QueryClientProvider>,
	);
};

test("a component mounting while the entity-scoped customer refetches keeps the last fetched customer", () => {
	const html = renderWithCache([
		"customer",
		"customer_123",
		null,
		false,
		...scope,
	]);

	expect(html).toContain("Example Customer");
});

test("a customer whose last refresh failed is still reused", () => {
	const html = renderWithCache(
		["customer", "customer_123", null, false, ...scope],
		{ refreshFailed: true },
	);

	expect(html).toContain("Example Customer");
});

test("a customer cached under another org scope is not reused", () => {
	const html = renderWithCache([
		"customer",
		"customer_123",
		null,
		false,
		"live",
		"org_other",
		null,
	]);

	expect(html).toContain("missing");
});
