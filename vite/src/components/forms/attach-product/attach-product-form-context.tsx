import { createContext, useContext } from "react";
import type { UseAttachProductForm } from "./use-attach-product-form";

const AttachProductFormContext = createContext<UseAttachProductForm | null>(
	null,
);

export function AttachProductFormProvider({
	form,
	children,
}: {
	form: UseAttachProductForm;
	children: React.ReactNode;
}) {
	return (
		<AttachProductFormContext.Provider value={form}>
			{children}
		</AttachProductFormContext.Provider>
	);
}

export function useAttachProductFormContext(): UseAttachProductForm {
	const context = useContext(AttachProductFormContext);
	if (!context) {
		throw new Error(
			"useAttachProductFormContext must be used within AttachProductFormProvider",
		);
	}
	return context;
}
