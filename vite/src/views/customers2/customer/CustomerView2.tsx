"use client";

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { pushPage } from "@/utils/genUtils";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useCusQuery } from "../../customers/customer/hooks/useCusQuery";
import { useCusReferralQuery } from "../../customers/customer/hooks/useCusReferralQuery";
import { CustomerFeatureUsageTable } from "../components/table/customer-feature-usage/CustomerFeatureUsageTable";
import { CustomerInvoicesTable } from "../components/table/customer-invoices/CustomerInvoicesTable";
import { CustomerProductsTable } from "../components/table/customer-products/CustomerProductsTable";
import { CustomerUsageAnalyticsTable } from "../components/table/customer-usage-analytics/CustomerUsageAnalyticsTable";
import { CustomerActions } from "./CustomerActions";
import { CustomerBalanceSheets } from "./CustomerBalanceSheets";
import { CustomerBreadcrumbs } from "./CustomerBreadcrumbs2";
import { CustomerContext } from "./CustomerContext";
import { CustomerPageDetails } from "./CustomerPageDetails";
import { SelectedEntityDetails } from "./components/SelectedEntityDetails";

export default function CustomerView2() {
	const [searchParams] = useSearchParams();
	const entityIdParam = searchParams.get("entity_id");

	const { customer, isLoading: cusLoading } = useCusQuery();

	useCusReferralQuery();

	const [entityId, setEntityId] = useState(entityIdParam);
	const closeSheet = useCustomerBalanceSheetStore((s) => s.closeSheet);

	useEffect(() => {
		if (entityIdParam) {
			setEntityId(entityIdParam);
		} else {
			setEntityId(null);
		}
	}, [entityIdParam]);

	// Close modal on mount
	useEffect(() => {
		closeSheet();
	}, [closeSheet]);

	if (cusLoading) return <LoadingScreen />;

	if (!customer) {
		return (
			<ErrorScreen>
				<div className="text-t2 text-sm">Customer not found</div>
				<Link
					className="text-t3 text-xs hover:underline"
					to={pushPage({ path: "/customers" })}
				>
					Return
				</Link>
			</ErrorScreen>
		);
	}

	console.log("customer", customer);

	return (
		<CustomerContext.Provider
			value={{ customer, entityId: entityId, setEntityId }}
		>
			<div className="flex w-full h-full overflow-hidden relative">
				<div className="flex flex-col overflow-x-hidden overflow-y-auto absolute inset-0 pb-8 [&>*:not([data-slot=separator-root])]:px-12 [&>*:not([data-slot=separator-root])]:pt-8 [&>*:not([data-slot=separator-root])]:max-w-4xl [&>*:not([data-slot=separator-root])]:mx-auto">
					<div className="flex flex-col gap-2 w-full">
						<div className="flex flex-col w-full">
							<div className="flex items-center justify-between w-full gap-4">
								<CustomerBreadcrumbs />
								<CustomerActions />
							</div>
							<div className="flex items-center justify-between w-full pt-2">
								<h3
									className={`text-md font-semibold ${
										customer.name
											? "text-t1"
											: customer.email
												? "text-t3"
												: "text-t4 font-mono font-medium!"
									}`}
								>
									{customer.name || customer.email || customer.id}
								</h3>

								<CustomerPageDetails />
							</div>
						</div>
						<SelectedEntityDetails />
					</div>
					{/* <Separator /> */}
					{/* <Separator className="my-2" /> */}
					<div className="flex flex-col gap-10 w-full">
						<CustomerProductsTable />
						{/* <Separator /> */}
						<CustomerFeatureUsageTable />
						{/* <Separator /> */}
						<CustomerUsageAnalyticsTable />
						{/* <Separator /> */}
						<CustomerInvoicesTable />
					</div>
				</div>
				<CustomerBalanceSheets />
			</div>
		</CustomerContext.Provider>
	);
}
