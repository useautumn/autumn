import type { ReactElement } from "react";

interface IconBadgeProps {
	icon: ReactElement;
	children: React.ReactNode;
	className?: string;
}

export const IconBadge = ({
	icon,
	children,
	className = "",
}: IconBadgeProps) => {
	return (
		<div
			className={`inline-flex items-center gap-2 bg-white border border-border rounded-lg h-[24px] w-fit px-2 py-[3px] shadow-[0px_4px_4px_rgba(0,0,0,0.02),_inset_0px_-3px_4px_rgba(0,0,0,0.04)] ${className}`}
		>
			<span className="text-t4">{icon}</span>
			{children}
		</div>
	);
};
