import type { FrontendProduct } from "@autumn/shared";
import type { ReactNode } from "react";
import { ProductProvider } from "./PlanEditorContext";
import { useInlineProductEditor } from "./useInlineProductEditor";

interface InlineEditorProviderProps {
	children: ReactNode;
	initialProduct: FrontendProduct;
	isInvoiceEditor?: boolean;
}

export function InlineEditorProvider({
	children,
	initialProduct,
	isInvoiceEditor,
}: InlineEditorProviderProps) {
	const editor = useInlineProductEditor({ initialProduct });

	return (
		<ProductProvider {...editor} isInvoiceEditor={isInvoiceEditor}>
			{children}
		</ProductProvider>
	);
}
