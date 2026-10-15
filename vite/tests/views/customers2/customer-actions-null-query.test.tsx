import { expect, mock, test } from "bun:test";
import type { FullCustomer } from "@autumn/shared";

mock.module("@/views/customers/customer/hooks/useCusQuery", () => ({
	useCusQuery: () => ({ customer: null, refetch: async () => {} }),
}));
mock.module("@/hooks/common/useOrg", () => ({
	useOrg: () => ({ org: { processor_configs: {} } }),
}));
mock.module("@/services/useAxiosInstance", () => ({
	useAxiosInstance: () => ({}),
}));
mock.module(
	"@/views/customers/customer/components/UpdateCustomerDialog",
	() => ({
		default: ({ selectedCustomer }: { selectedCustomer: FullCustomer }) => (
			<span>{selectedCustomer.processor.id}</span>
		),
	}),
);
mock.module("@/views/customers2/customer/components/AddCouponDialog", () => ({
	AddCouponDialog: () => null,
}));
mock.module("@/views/customers2/customer/components/CreateEntity", () => ({
	CreateEntity: () => null,
}));
mock.module("@/views/admin/hooks/useAdmin", () => ({
	useAdmin: () => ({ isAdmin: false }),
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { MemoryRouter } = await import("react-router");
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { CustomerContext } = await import(
	"@/views/customers2/customer/CustomerContext"
);
const { CustomerActions } = await import(
	"@/views/customers2/customer/CustomerActions"
);

const customer = {
	id: "customer_123",
	internal_id: "cus_internal_123",
	name: "Example Customer",
	processor: { id: "cus_stripe_123", type: "stripe" },
	customer_products: [],
	entities: [],
} as unknown as FullCustomer;

test("actions render the page's customer while a remounted customer query is still empty", () => {
	const html = renderToStaticMarkup(
		<QueryClientProvider client={new QueryClient()}>
			<MemoryRouter>
				<CustomerContext.Provider
					value={{
						customer,
						entityId: "workspace_a",
						setEntityId: () => {},
						isInlineEditorOpen: false,
						setIsInlineEditorOpen: () => {},
					}}
				>
					<CustomerActions />
				</CustomerContext.Provider>
			</MemoryRouter>
		</QueryClientProvider>,
	);

	expect(html).toContain("cus_stripe_123");
});
