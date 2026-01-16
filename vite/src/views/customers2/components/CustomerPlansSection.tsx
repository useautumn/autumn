import { CustomerProductsTable } from "./table/customer-products/CustomerProductsTable";
import { CustomerPurchasesTable } from "./table/customer-purchases/CustomerPurchasesTable";

export function CustomerPlansSection() {
	return (
		<div className="flex flex-col gap-6">
			<CustomerProductsTable />
			<CustomerPurchasesTable />
		</div>
	);
}
