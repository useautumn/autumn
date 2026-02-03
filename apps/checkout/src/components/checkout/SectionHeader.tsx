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
		<div className="flex flex-col gap-0.5">
			<div className="flex items-center justify-between">
				<span className="text-foreground">{title}</span>
				{rightContent}
			</div>
			{subheading && (
				<span className="text-xs text-muted-foreground">{subheading}</span>
			)}
		</div>
	);
}
