import { cn } from "@/lib/utils";

export const SelectType = ({
	title,
	description,
	icon,
	isSelected,
	onClick,
	disabled = false,
}: {
	title: string;
	description: string;
	icon: React.ReactNode;
	isSelected: boolean;
	onClick: () => void;
	disabled?: boolean;
}) => {
	return (
		<button
			className={cn(
				`relative h-full flex flex-col text-start gap-2 text-sm p-3 rounded-xs cursor-pointer `,
				isSelected
					? "shadow-inner bg-stone-100 border border-zinc-400 ring-1 ring-zinc-300/50"
					: "border hover:shadow-sm",
				disabled && "opacity-50 cursor-default",
			)}
			onClick={onClick}
			disabled={disabled}
		>
			<div className="flex items-center gap-1 justify-center">
				{/* <div className="flex w-4 h-full items-center justify-start text-t2">
          {icon}
        </div> */}
				<span className="w-0 -translate-x-4 text-t2">{icon}</span>
				<span className="relative text-t2 text-sm font-medium whitespace-nowrap leading-none">
					{title}
				</span>
			</div>
			<p className="text-t2 text-xs text-center">{description}</p>
		</button>
	);
};
