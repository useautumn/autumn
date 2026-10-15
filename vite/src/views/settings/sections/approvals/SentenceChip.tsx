import { cn } from "@/lib/utils";

/** One bordered token in a rule sentence: a subject, an action or a condition. */
export const SentenceChip = ({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) => (
	<span
		className={cn(
			"inline-flex items-center gap-1 rounded-md border bg-interactive-secondary px-1.5 py-0.5 text-foreground",
			className,
		)}
	>
		{children}
	</span>
);
