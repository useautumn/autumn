import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ClickableIconProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	icon: React.ReactElement;
	asChild?: boolean;
}

export const ClickableIcon = ({
	icon,
	onClick,
	asChild,
	...props
}: ClickableIconProps) => {
	const Comp = asChild ? Slot : "button";

	return (
		<Comp
			{...{
				...props,
				className: cn("hover:", props.className ?? ""),
				onClick: onClick,
			}}
		>
			{icon}
		</Comp>
	);
};
