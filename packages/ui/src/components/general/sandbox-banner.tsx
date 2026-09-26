import { cn } from "@autumn/ui/lib/utils";
import { ArrowUpRightIcon, FlaskIcon } from "@phosphor-icons/react";

export function SandboxBanner({
	children,
	label = "Sandbox",
	icon,
	color,
	className,
}: {
	children?: React.ReactNode;
	label?: string;
	icon?: React.ReactNode;
	color?: string;
	className?: string;
}) {
	return (
		<div className="pointer-events-none z-50 flex justify-center sm:absolute sm:inset-x-0 sm:top-0">
			<div
				className={cn(
					"pointer-events-auto flex h-[26px] items-center gap-2.5 rounded-b-lg bg-sandbox pr-1 pb-0.5 pl-2.5 text-white",
					className,
				)}
				style={color ? { backgroundColor: color } : undefined}
			>
				<div className="flex items-center gap-1.5">
					{icon ?? <FlaskIcon className="size-3" weight="fill" />}
					<span className="max-w-48 truncate font-semibold text-xs">
						{label}
					</span>
				</div>
				{children}
			</div>
		</div>
	);
}

export function SandboxBannerAction({
	children,
	className,
	...props
}: React.ComponentProps<"button">) {
	return (
		<button
			type="button"
			className={cn(
				"flex h-[18px] cursor-pointer items-center gap-1 rounded-[5px] bg-white/15 pr-1.5 pl-[7px] font-medium text-[11px] outline-none",
				"transition-[background-color,scale] duration-150 ease-out hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.97]",
				className,
			)}
			{...props}
		>
			{children}
			<ArrowUpRightIcon className="size-2.5" weight="bold" />
		</button>
	);
}
