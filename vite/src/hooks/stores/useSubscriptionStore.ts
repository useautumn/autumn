import {
	cusProductToProduct,
	type Entity,
	type FullCusProduct,
	type FullCustomer,
	mapToProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { parseAsString, useQueryStates } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

// Hook to sync entity_id between query params and store
export const useEntity = () => {
	const [{ entity_id }, setQueryStates] = useQueryStates({
		entity_id: parseAsString,
	});

	const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

	const { customer } = useCusQuery();
	const entities = (customer as FullCustomer)?.entities || [];

	// #region agent log
	fetch('http://127.0.0.1:7322/ingest/302190cd-01f7-494e-9c36-a1625f5cf969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0967f4'},body:JSON.stringify({sessionId:'0967f4',location:'useSubscriptionStore.ts:useEntity',message:'entities debug',data:{customerExists:!!customer,entitiesRaw:(customer as any)?.entities,entitiesIsArray:Array.isArray((customer as any)?.entities),entitiesLength:entities.length,entitiesNullCount:entities.filter((e:any) => e == null).length,firstFewEntities:entities.slice(0,3).map((e:any) => e == null ? 'NULL' : {id:e?.id,internal_id:e?.internal_id}),selectedEntityId},timestamp:Date.now()})}).catch(()=>{});
	// #endregion

	// Find the full entity object
	const entity = entities.find(
		(e: Entity) =>
			e != null &&
			(e.id === selectedEntityId || e.internal_id === selectedEntityId),
	);

	// Sync query param to store on mount/change
	useEffect(() => {
		if (entity_id !== selectedEntityId) {
			setSelectedEntityId(entity_id);
		}
	}, [entity_id, selectedEntityId]);

	// Function to update both store and query param
	const setEntityId = (entityId: string | null) => {
		setSelectedEntityId(entityId);
		setQueryStates({ entity_id: entityId });
	};

	return { entityId: selectedEntityId, entity, setEntityId };
};

// Hook to get a customer product and its productV2 by customer product ID
export const useSubscriptionById = ({ itemId }: { itemId: string | null }) => {
	const { customer } = useCusQuery();

	const cusProduct = useMemo(() => {
		if (!itemId || !customer?.customer_products) return null;
		return customer.customer_products.find(
			(p: FullCusProduct) => p.id === itemId,
		);
	}, [itemId, customer?.customer_products]);

	const productV2 = useMemo(() => {
		if (!cusProduct) return null;
		const fullProduct = cusProductToProduct({ cusProduct });
		const productV2 = mapToProductV2({ product: fullProduct });
		return productV2ToFrontendProduct({ product: productV2 });
	}, [cusProduct]);

	return { cusProduct, productV2 };
};
