/** Red: the inline editor fetched `/product/undefined`; green: route-dependent fetching waits for both IDs. */

import { beforeEach, expect, mock, test } from "bun:test";

const get = mock(async () => ({ data: {} }));
let routeParams: { customer_id?: string; product_id?: string } = {};

mock.module("react", () => ({
	useEffect: () => undefined,
	useMemo: (factory: () => unknown) => factory(),
	useState: (initial: unknown) => [initial, () => undefined],
}));

mock.module("react-router", () => ({
	useParams: () => routeParams,
}));

mock.module("nuqs", () => ({
	parseAsInteger: {},
	parseAsString: {},
	useQueryStates: () => [{}],
}));

mock.module("@tanstack/react-query", () => ({
	useQuery: (options: { enabled?: boolean; queryFn: () => unknown }) => {
		if (options.enabled !== false) void options.queryFn();
		return { data: undefined, isLoading: false, error: null, refetch: mock() };
	},
}));

mock.module("@/hooks/common/useQueryKeyFactory", () => ({
	useQueryKeyFactory: () => (key: unknown[]) => key,
}));

mock.module("@/services/useAxiosInstance", () => ({
	useAxiosInstance: () => ({ get }),
}));

mock.module(
	"@/views/customers/customer/product/hooks/useCusProductCache",
	() => ({
		useCusProductCache: () => ({ getCachedCusProduct: () => undefined }),
	}),
);

const { useCusProductQuery } = await import(
	"@/views/customers/customer/product/hooks/useCusProductQuery"
);

beforeEach(() => {
	get.mockClear();
	routeParams = {};
});

test("does not fetch a customer product without a product route parameter", () => {
	routeParams = { customer_id: "cus_123" };

	useCusProductQuery();

	expect(get).not.toHaveBeenCalled();
});

test("fetches when both customer and product route parameters exist", () => {
	routeParams = { customer_id: "cus_123", product_id: "pro_yearly" };

	useCusProductQuery();

	expect(get).toHaveBeenCalledWith(
		"/customers/cus_123/product/pro_yearly",
		expect.any(Object),
	);
});
