import {
	cusProductToProduct,
	type Entity,
	type FrontendProduct,
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
	productId: string;
	prepaidOptions: Record<string, number>;
	customizedProduct: FrontendProduct | null;
	customerProductId: string | null;
	selectedEntityId: string | null;
}

interface AttachProductState extends AttachProductFormValues {
	// Actions
	setCustomerId: (customerId: string | null) => void;
	setProductId: (productId: string) => void;
	setPrepaidOptions: (options: Record<string, number>) => void;
	setCustomizedProduct: (
		product: {
			product: FrontendProduct;
			customer_product_id?: string | null;
		} | null,
	) => void;
	setSelectedEntityId: (entityId: string | null) => void;
	setFormValues: (values: Partial<AttachProductFormValues>) => void;
	reset: () => void;
}

const initialState: AttachProductFormValues = {
	customerId: null,
	productId: "",
	prepaidOptions: {},
	customizedProduct: null,
	customerProductId: null,
	selectedEntityId: null,
};

export const useAttachProductStore = create<AttachProductState>((set) => ({
	...initialState,

	setCustomerId: (customerId) => set({ customerId }),
	setProductId: (productId) => set({ productId }),
	setPrepaidOptions: (prepaidOptions) => set({ prepaidOptions }),
	setCustomizedProduct: (customizedProduct) =>
		set({
			customizedProduct: customizedProduct?.product ?? null,
			customerProductId: customizedProduct?.customer_product_id ?? null,
		}),
	setSelectedEntityId: (selectedEntityId) => set({ selectedEntityId }),

	// Convenience method to set multiple values at once
	setFormValues: (values) => set(values),

	reset: () => set(initialState),
}));

// Convenience selector hook to get all form values
export const useAttachProductFormValues = () =>
	useAttachProductStore((s) => ({
		customerId: s.customerId,
		productId: s.productId,
		prepaidOptions: s.prepaidOptions,
		customizedProduct: s.customizedProduct,
		customerProductId: s.customerProductId,
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
