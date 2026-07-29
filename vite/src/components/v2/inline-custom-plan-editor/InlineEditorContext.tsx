import type { FrontendProduct } from "@autumn/shared";
import type { ReactNode } from "react";
import { ProductProvider } from "./PlanEditorContext";
import { useInlineProductEditor } from "./useInlineProductEditor";

interface InlineEditorProviderProps {
	children: ReactNode;
	initialProduct: FrontendProduct;
}

/**
 * Provider for inline plan editing with local state.
 * Uses ProductProvider internally so child components can use useProduct/useSheet hooks.
 */
export function InlineEditorProvider({
	children,
	initialProduct,
}: InlineEditorProviderProps) {
	const editor = useInlineProductEditor({ initialProduct });

	return <ProductProvider {...editor}>{children}</ProductProvider>;
}
