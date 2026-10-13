import { cn } from "@/lib/utils";

/** A small uppercase tag beside a name, e.g. BETA or PREVIEW. */
export const LabelTag = ({
	label,
	className,
}: {
	label: string;
	className?: string;
}) => (
	<span
		className={cn(
			"rounded border border-black/10 px-[5px] text-[10px] font-medium leading-[15px] tracking-[0.04em] text-[#8A8A8A] dark:border-[#262626] dark:text-[#6A6A6A]",
			className,
		)}
	>
		{label}
	</span>
);
