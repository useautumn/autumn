import {
	cusProductToProduct,
	type Entity,
	type FullCusProduct,
	type FullCustomer,
	mapToProductV2,
} from "@autumn/shared";
import { parseAsString, useQueryStates } from "nuqs";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

interface AttachProductFormValues {
	customerId: string | null;
	selectedEntityId: string | null;
}

interface AttachProductState extends AttachProductFormValues {
	// Actions
	setCustomerId: (customerId: string | null) => void;
	setSelectedEntityId: (entityId: string | null) => void;
	reset: () => void;
}

const initialState: AttachProductFormValues = {
	customerId: null,
	selectedEntityId: null,
};

export const useAttachProductStore = create<AttachProductState>((set) => ({
	...initialState,

	setCustomerId: (customerId) => set({ customerId }),
	setSelectedEntityId: (selectedEntityId) => set({ selectedEntityId }),

	reset: () => set(initialState),
}));

// Hook to sync entity_id between query params and store
export const useEntity = () => {
	const [{ entity_id }, setQueryStates] = useQueryStates({
		entity_id: parseAsString,
	});

	const setSelectedEntityId = useAttachProductStore(
		(s) => s.setSelectedEntityId,
	);
	const selectedEntityId = useAttachProductStore((s) => s.selectedEntityId);

	const { customer } = useCusQuery();
	const entities = (customer as FullCustomer)?.entities || [];

	// Find the full entity object
	const entity = entities.find(
		(e: Entity) =>
			e.id === selectedEntityId || e.internal_id === selectedEntityId,
	);

	// Sync query param to store on mount/change
	useEffect(() => {
		if (entity_id !== selectedEntityId) {
			setSelectedEntityId(entity_id);
		}
	}, [entity_id, selectedEntityId, setSelectedEntityId]);

	// Function to update both store and query param
	const setEntityId = (entityId: string | null) => {
		setSelectedEntityId(entityId);
		setQueryStates({ entity_id: entityId });
	};

	return { entityId: selectedEntityId, entity, setEntityId };
};

// Hook to get a customer product and its productV2 by itemId
export const useSubscriptionById = ({ itemId }: { itemId: string | null }) => {
	const { customer } = useCusQuery();

	const cusProduct = useMemo(() => {
		if (!itemId || !customer?.customer_products) return null;
		return customer.customer_products.find(
			(p: FullCusProduct) =>
				p.id === itemId || p.internal_product_id === itemId,
		);
	}, [itemId, customer?.customer_products]);

	const productV2 = useMemo(() => {
		if (!cusProduct) return null;
		const fullProduct = cusProductToProduct({ cusProduct });
		return mapToProductV2({ product: fullProduct });
	}, [cusProduct]);

	return { cusProduct, productV2 };
};
