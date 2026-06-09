import { CubeIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/general/PageHeader";

interface ProductsPageHeaderProps {
	children?: ReactNode;
}

/**
 * Shared header for the Products/Plans page.
 */
export function ProductsPageHeader({ children }: ProductsPageHeaderProps) {
	return (
		<PageHeader
			icon={<CubeIcon size={16} weight="fill" className="text-subtle" />}
			title="Plans"
		>
			{children}
		</PageHeader>
	);
}
