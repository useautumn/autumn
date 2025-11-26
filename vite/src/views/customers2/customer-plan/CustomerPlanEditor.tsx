"use client";

import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
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
import { ProductContext } from "@/views/products/product/ProductContext";

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
	const [searchParams] = useSearchParams();
	const entityIdParam = searchParams.get("entity_id");
	const closeSheet = useSheetStore((s) => s.closeSheet);

	//Close the subscription detail / attach product sheet when navigating to this page (prevents jank closing animation)
	useEffect(() => {
		closeSheet();
	}, []);

	const { isLoading: orgLoading } = useOrg();
	const { isLoading: featuresLoading } = useFeaturesQuery();

	const [options, setOptions] = useState<OptionValue[]>([]);
	const [entityId, setEntityId] = useState<string | null>(entityIdParam);
	const [entityFeatureIds, setEntityFeatureIds] = useState<string[]>([]);

	const {
		product: originalProduct,
		cusProduct,
		isLoading,
		error,
	} = useCusProductQuery();

	useProductSync({ product: originalProduct });

	const { isLoading: cusLoading } = useCusQuery();

	//probs not needed anymore? used to pass entityId into the ProductContext
	//now we can get it from CusProductQuery?
	// useEffect(() => {
	// 	if (entityIdParam) {
	// 		setEntityId(entityIdParam);
	// 	} else {
	// 		setEntityId(null);
	// 	}
	// }, [entityIdParam]);

	// useEffect(() => {
	// 	if (!originalProduct) return;

	// 	const product = originalProduct;

	// 	console.log("[CPV] effect", {
	// 		prodId: originalProduct.id,
	// 		v: originalProduct.version,
	// 		cusId: cusProduct?.id,
	// 	});

	// 	// Update initialProductRef BEFORE setProduct to ensure useAttachState
	// 	// effect has the correct baseline when it runs
	// 	initialProductRef.current = structuredClone({
	// 		...product,
	// 		items: sortProductItems(product.items),
	// 	});

	// 	setProduct(product);

	// 	setEntityFeatureIds(
	// 		Array.from(
	// 			new Set(
	// 				product.items
	// 					.filter((item: ProductItem) => notNullish(item.entity_feature_id))
	// 					.map((item: ProductItem) => item.entity_feature_id!),
	// 			),
	// 		),
	// 	);

	// 	if (cusProduct?.options) {
	// 		setOptions(cusProduct.options);
	// 	} else {
	// 		setOptions([]);
	// 	}
	// }, [originalProduct, cusProduct]);

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
		<ProductContext.Provider
			value={{
				// isCusProductView: true,
				// product,
				// setProduct,

				entityId,
				setEntityId,
				// attachState,
				entityFeatureIds,
				setEntityFeatureIds,
			}}
		>
			<CustomToaster />

			<PlanEditor />
		</ProductContext.Provider>
	);
}

export const CopyUrl = ({
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
