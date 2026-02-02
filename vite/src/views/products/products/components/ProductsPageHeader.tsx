import { CubeIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

interface ProductsPageHeaderProps {
	children?: ReactNode;
}

/**
 * Shared header for the Products/Plans page.
 * Matches Table.Toolbar + Table.Heading styles.
 */
export function ProductsPageHeader({ children }: ProductsPageHeaderProps) {
	return (
		<div className="flex flex-wrap items-center gap-2 h-10 pb-4">
			<div className="flex w-full justify-between items-center">
				<div className="text-t2 text-md py-0 px-2 rounded-lg flex gap-2 items-center">
					<CubeIcon size={16} weight="fill" className="text-subtle" />
					Plans
				</div>
				<div className="flex items-center gap-2">{children}</div>
			</div>
		</div>
	);
}
