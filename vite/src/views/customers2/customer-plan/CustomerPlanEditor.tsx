"use client";

import { useEffect } from "react";
import { useParams } from "react-router";
import { CustomToaster } from "@/components/general/CustomToaster";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductSync } from "@/hooks/stores/useProductSync";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCusProductQuery } from "@/views/customers/customer/product/hooks/useCusProductQuery";
import { CustomerPageTitle } from "@/views/customers2/customer/CustomerPageTitle";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { PlanEditor } from "@/views/products/plan/components/PlanEditor";

export default function CustomerProductView() {
	const { customer_id, product_id } = useParams();
	const closeSheet = useSheetStore((s) => s.closeSheet);

	//Close the subscription detail / attach product sheet when navigating to this page (prevents jank closing animation)
	useEffect(() => {
		closeSheet();
	}, []);

	const { isLoading: orgLoading } = useOrg();
	const { isLoading: featuresLoading } = useFeaturesQuery();

	const { product: originalProduct, isLoading, error } = useCusProductQuery();

	useProductSync({ product: originalProduct });

	const { customer, isLoading: cusLoading } = useCusQuery();

	if (error) {
		return (
			<ErrorScreen>
				<p>
					Customer {customer_id} or product {product_id} not found
				</p>
			</ErrorScreen>
		);
	}

	if (isLoading || cusLoading || orgLoading || featuresLoading)
		return <LoadingScreen />;

	if (!customer_id || !product_id) {
		return <div>Customer or product not found</div>;
	}

	return (
		<>
			<CustomerPageTitle customer={customer} />
			<CustomToaster />

			<PlanEditor />
		</>
	);
}
