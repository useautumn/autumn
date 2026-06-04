import type { ReactNode } from "react";

/**
 * Shared page header: leading icon + title on the left, optional actions on
 * the right. Matches Table.Toolbar + Table.Heading styles.
 */
export function PageHeader({
	icon,
	title,
	children,
}: {
	icon: ReactNode;
	title: string;
	children?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2 h-10 pb-4">
			<div className="flex w-full justify-between items-center">
				<div className="text-muted-foreground text-md py-0 px-2 rounded-lg flex gap-2 items-center">
					{icon}
					{title}
				</div>
				<div className="flex items-center gap-2">{children}</div>
			</div>
		</div>
	);
}
