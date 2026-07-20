import { describe, expect, test } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
import { Skeleton } from "@autumn/ui";
import type { ReactElement } from "react";
import { createProductListColumns } from "@/views/products/products/components/product-list/ProductListColumns";
import { ProductCountsTooltip } from "@/views/products/products/product-row-toolbar/ProductCountsTooltip";

const product = { id: "pro" } as ProductV2;

const renderCustomerCell = ({
	isCountsLoading,
}: {
	isCountsLoading: boolean;
}) => {
	const customerColumn = createProductListColumns({ isCountsLoading }).find(
		(column) => column.header === "Customers",
	);

	if (typeof customerColumn?.cell !== "function") {
		throw new Error("Customers column cell is not renderable");
	}

	return customerColumn.cell({
		row: { original: product },
	} as never) as ReactElement<{ children: ReactElement }>;
};

describe("product list customer count loading", () => {
	test("shows a skeleton in the Customers cell while counts load", () => {
		const cell = renderCustomerCell({ isCountsLoading: true });

		expect(cell.props.children.type).toBe(Skeleton);
		expect(cell.props.children.props["aria-label"]).toBe("Loading");
	});

	test("shows the customer count tooltip after counts load", () => {
		const cell = renderCustomerCell({ isCountsLoading: false });

		expect(cell.props.children.type).toBe(ProductCountsTooltip);
	});
});
