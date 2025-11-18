"use client";

import { CusProductStatus } from "@autumn/shared";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { notNullish, pushPage } from "@/utils/genUtils";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { CustomerContext } from "./CustomerContext";
import { CustomerEventsList } from "./CustomerEventsList";
import { CustomerPageHeader } from "./components/customer-header/CustomerPageHeader";
import { CustomerSidebar } from "./components/customer-sidebar/CustomerSidebar";
import { CustomerProductList } from "./customer-product-list/CustomerProductList";
import { CustomerEntitlementsList } from "./entitlements/CustomerEntitlementsList";
import { useCusQuery } from "./hooks/useCusQuery";
import { useCusReferralQuery } from "./hooks/useCusReferralQuery";
import { InvoicesTable } from "./InvoicesTable";

export default function CustomerView() {
	// const { customer_id } = useParams();
	const [searchParams] = useSearchParams();
	const entityIdParam = searchParams.get("entity_id");

	const { customer, isLoading: cusLoading, error, refetch } = useCusQuery();

	useCusReferralQuery();

	// const {
	//   data,
	//   isLoading,
	//   mutate: cusMutate,
	// } = useAxiosSWR({
	//   url: `/customers/${customer_id}/data`,
	//   env,
	// });

	// const { data: referrals } = useAxiosSWR({
	//   url: `/customers/${customer_id}/referrals`,
	//   env,
	// });
	// const { data: rewardsData } = useAxiosSWR({
	//   url: `/products/rewards`,
	//   env,
	// });

	const [setAddCouponOpen] = useState(false);
	const [entityId, setEntityId] = useState(entityIdParam);

	useEffect(() => {
		if (entityIdParam) {
			setEntityId(entityIdParam);
		} else {
			setEntityId(null);
		}
	}, [entityIdParam]);

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

	// const { customer, products, invoices, coupons, discount, events, entities } =
	//   data;

	const showEntityView = customer.customer_products.some(
		(cp: any) =>
			notNullish(cp.internal_entity_id) &&
			cp.status !== CusProductStatus.Expired,
	);

	return (
		<CustomerContext.Provider
			value={{
				// ...data,
				// customer,
				// products,
				// invoices,
				// coupons,
				// discount,
				// env,
				// cusMutate,
				// setAddCouponOpen,
				// referrals,
				entityId,
				setEntityId,
				showEntityView,
				// rewards: rewardsData?.rewards,
			}}
		>
			<div className="flex w-full overflow-y-scroll h-full">
				<div className="flex flex-col gap-4 w-full ">
					<CustomerPageHeader />
					<div className="flex w-full !pb-[50px]">
						<div className="flex flex-col gap-10 w-full text-t2 text-sm">
							<div className="flex flex-col gap-2">
								<CustomerProductList />
							</div>
							<div className="flex flex-col gap-2">
								<CustomerEntitlementsList />
							</div>

							<InvoicesTable />
							<CustomerEventsList />
						</div>
					</div>
				</div>
				<div className="max-w-md w-1/3 shrink-1 hidden lg:block lg:min-w-xs sticky top-0">
					<CustomerSidebar />
				</div>
			</div>
		</CustomerContext.Provider>
	);
}
