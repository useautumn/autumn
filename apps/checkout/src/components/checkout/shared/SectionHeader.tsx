import type { ReactNode } from "react";

interface SectionHeaderProps {
	title: string;
	subheading?: string;
	rightContent?: ReactNode;
}

export function SectionHeader({
	title,
	subheading,
	rightContent,
}: SectionHeaderProps) {
	return (
		<div className="flex flex-col gap-0.5 min-w-0">
			<div className="flex items-center justify-between gap-4">
				<span className="text-foreground truncate">{title}</span>
				{rightContent && <div className="shrink-0">{rightContent}</div>}
			</div>
			{subheading && (
				<span className="text-xs text-muted-foreground line-clamp-2">{subheading}</span>
			)}
		</div>
	);
}
