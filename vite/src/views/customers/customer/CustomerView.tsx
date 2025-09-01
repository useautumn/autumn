"use client";

import { type AppEnv, CusProductStatus } from "@autumn/shared";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { getRedirectUrl, notNullish } from "@/utils/genUtils";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { CustomerContext } from "./CustomerContext";
import { CustomerEventsList } from "./CustomerEventsList";
import { CustomerBreadcrumbs } from "./customer-breadcrumbs";
import { CustomerProductList } from "./customer-product-list/CustomerProductList";

import { CustomerSidebar } from "./customer-sidebar/CustomerSidebar";
import { SelectEntity } from "./customer-sidebar/select-entity";
import { CustomerEntitlementsList } from "./entitlements/CustomerEntitlementsList";
import { InvoicesTable } from "./InvoicesTable";

export default function CustomerView({ env }: { env: AppEnv }) {
	const { customer_id } = useParams();
	const [searchParams] = useSearchParams();
	const entityIdParam = searchParams.get("entity_id");

	const {
		data,
		isLoading,
		mutate: cusMutate,
	} = useAxiosSWR({
		url: `/customers/${customer_id}/data`,
		env,
	});

	const { data: referrals } = useAxiosSWR({
		url: `/customers/${customer_id}/referrals`,
		env,
	});
	const { data: rewardsData } = useAxiosSWR({
		url: `/products/rewards`,
		env,
	});

	const [setAddCouponOpen] = useState(false);
	const [entityId, setEntityId] = useState(entityIdParam);

	useEffect(() => {
		if (entityIdParam) {
			setEntityId(entityIdParam);
		} else {
			setEntityId(null);
		}
	}, [entityIdParam]);

	if (isLoading) return <LoadingScreen />;

	if (!data) {
		return (
			<ErrorScreen>
				<div className="text-t2 text-sm">Customer not found</div>
				<Link
					className="text-t3 text-xs hover:underline"
					to={getRedirectUrl("/customers", env)}
				>
					Return
				</Link>
			</ErrorScreen>
		);
	}

	const { customer, products, invoices, coupons, discount, events, entities } =
		data;

	const showEntityView = customer.customer_products.some(
		(cp: any) =>
			notNullish(cp.internal_entity_id) &&
			cp.status !== CusProductStatus.Expired,
	);

	return (
		<CustomerContext.Provider
			value={{
				...data,
				customer,
				products,
				invoices,
				coupons,
				discount,
				env,
				cusMutate,
				setAddCouponOpen,
				referrals,
				entityId,
				setEntityId,
				showEntityView,
				rewards: rewardsData?.rewards,
			}}
		>
			<div className="flex w-full overflow-auto h-full ">
				<div className="flex flex-col gap-4 w-full ">
					<CustomerBreadcrumbs />
					<div className="flex w-full justify-between pl-10 pr-7">
						<div className="flex gap-2 w-full">
							<h2 className="flex text-lg text-t1 font-medium w-full max-w-md justify-start truncate">
								{customer.name ? (
									<span className="truncate">{customer.name}</span>
								) : customer.id ? (
									<span className="truncate font-mono">{customer.id}</span>
								) : (
									<span className="truncate">{customer.email}</span>
								)}
							</h2>
						</div>
						{/* <EntityHeader entity={entity} /> */}
						<SelectEntity entityId={entityId || ""} entities={entities} />
					</div>
					<div className="flex w-full !pb-[50px]">
						{/* main content */}
						<div className="flex flex-col gap-10 w-full text-t2 text-sm">
							<div className="flex flex-col gap-2">
								<CustomerProductList customer={customer} products={products} />
							</div>

							<div className="flex flex-col gap-2">
								<CustomerEntitlementsList />
							</div>

							<InvoicesTable />
							<CustomerEventsList
								customer={customer}
								events={events}
								env={env}
							/>
						</div>
						{/* customer details */}
					</div>
				</div>
				<div className="flex max-w-md w-1/3 shrink-1 hidden lg:block lg:min-w-xs sticky top-0">
					{/* <CustomerDetails /> */}
					<CustomerSidebar />
				</div>
			</div>
		</CustomerContext.Provider>
	);
}
