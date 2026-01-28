"use client";

import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { CustomToaster } from "@/components/general/CustomToaster";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductSync } from "@/hooks/stores/useProductSync";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCusProductQuery } from "@/views/customers/customer/product/hooks/useCusProductQuery";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { PlanEditor } from "@/views/products/plan/components/PlanEditor";

interface OptionValue {
	feature_id: string;
	threshold?: number;
	quantity?: number;
}

function getProductUrlParams({
	version,
	customer_product_id,
	entity_id,
}: {
	version?: string | null;
	customer_product_id?: string | null;
	entity_id?: string | null;
}) {
	const params = new URLSearchParams();
	if (version) params.append("version", version);
	if (customer_product_id)
		params.append("customer_product_id", customer_product_id);
	if (entity_id) params.append("entity_id", entity_id);
	const str = params.toString();
	return str ? `?${str}` : "";
}

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

	const { isLoading: cusLoading } = useCusQuery();

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
			<CustomToaster />

			<PlanEditor />
		</>
	);
}

const CopyUrl = ({
	url,
	isInvoice = false,
}: {
	url: string;
	isInvoice: boolean;
}) => {
	return (
		<div className="flex flex-col gap-2">
			{!isInvoice && (
				<p className="text-sm text-gray-500">
					This link will expire in 24 hours
				</p>
			)}
			<div className="w-full bg-gray-100 p-3 rounded-md">
				<Link
					className="text-xs text-t2 break-all hover:underline"
					to={url}
					target="_blank"
				>
					{url}
				</Link>
			</div>
		</div>
	);
};
