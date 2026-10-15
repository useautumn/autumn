import { expect, mock, test } from "bun:test";
import type { FullCustomer } from "@autumn/shared";

mock.module("@/views/customers/customer/hooks/useCusQuery", () => ({
	useCusQuery: () => ({ customer: null }),
}));
mock.module("@/hooks/stores/useSubscriptionStore", () => ({
	useEntity: () => ({ entityId: "workspace_a", setEntityId: () => {} }),
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { MemoryRouter } = await import("react-router");
const { CustomerContext } = await import(
	"@/views/customers2/customer/CustomerContext"
);
const { CustomerBreadcrumbs } = await import(
	"@/views/customers2/customer/CustomerBreadcrumbs2"
);

const customer = {
	id: "customer_123",
	internal_id: "cus_internal_123",
	name: "Example Customer",
	customer_products: [],
	entities: [{ id: "workspace_a", name: "Workspace A" }],
} as unknown as FullCustomer;

test("breadcrumbs render the page's customer while a remounted customer query is still empty", () => {
	const html = renderToStaticMarkup(
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
				<CustomerBreadcrumbs />
			</CustomerContext.Provider>
		</MemoryRouter>,
	);

	expect(html).toContain("Example Customer");
	expect(html).toContain("Workspace A");
});
