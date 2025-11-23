import { create } from "zustand";

interface AttachProductFormValues {
	customerId: string | null;
	productId: string;
	prepaidOptions: Record<string, number>;
}

interface AttachProductState extends AttachProductFormValues {
	// Actions
	setCustomerId: (customerId: string | null) => void;
	setProductId: (productId: string) => void;
	setPrepaidOptions: (options: Record<string, number>) => void;
	setFormValues: (values: Partial<AttachProductFormValues>) => void;
	reset: () => void;
}

const initialState: AttachProductFormValues = {
	customerId: null,
	productId: "",
	prepaidOptions: {},
};

export const useAttachProductStore = create<AttachProductState>((set) => ({
	...initialState,

	setCustomerId: (customerId) => set({ customerId }),
	setProductId: (productId) => set({ productId }),
	setPrepaidOptions: (prepaidOptions) => set({ prepaidOptions }),

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
	}));
