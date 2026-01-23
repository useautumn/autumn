import { createContext, type ReactNode, useContext } from "react";
import { cn } from "@/lib/utils";

const OptionCardContext = createContext<{ selected: boolean }>({
	selected: false,
});

function useOptionCardContext() {
	return useContext(OptionCardContext);
}

interface OptionCardProps {
	selected: boolean;
	onClick: () => void;
	children: ReactNode;
	className?: string;
}

function OptionCard({
	selected,
	onClick,
	children,
	className,
}: OptionCardProps) {
	return (
		<OptionCardContext.Provider value={{ selected }}>
			<button
				type="button"
				onClick={onClick}
				className={cn(
					"flex items-start gap-3 p-3 rounded-lg border text-left transition-colors w-full",
					selected
						? "border-violet-500/50 bg-violet-500/5"
						: "border-primary/20 hover:border-primary/40 hover:bg-primary/5",
					className,
				)}
			>
				{children}
			</button>
		</OptionCardContext.Provider>
	);
}

interface OptionCardIconProps {
	children: ReactNode;
	className?: string;
}

function OptionCardIcon({ children, className }: OptionCardIconProps) {
	const { selected } = useOptionCardContext();

	return (
		<div
			className={cn(
				"flex items-center justify-center size-8 rounded-md shrink-0",
				selected ? "bg-violet-500/10 text-violet-500" : "bg-primary/5 text-t2",
				className,
			)}
		>
			{children}
		</div>
	);
}

interface OptionCardContentProps {
	children: ReactNode;
	className?: string;
}

function OptionCardContent({ children, className }: OptionCardContentProps) {
	return (
		<div className={cn("flex flex-col gap-0.5 min-w-0", className)}>
			{children}
		</div>
	);
}

interface OptionCardLabelProps {
	children: ReactNode;
	className?: string;
}

function OptionCardLabel({ children, className }: OptionCardLabelProps) {
	const { selected } = useOptionCardContext();

	return (
		<span
			className={cn(
				"text-sm font-medium",
				selected ? "text-violet-500" : "text-t1",
				className,
			)}
		>
			{children}
		</span>
	);
}

interface OptionCardDescriptionProps {
	children: ReactNode;
	className?: string;
}

function OptionCardDescription({
	children,
	className,
}: OptionCardDescriptionProps) {
	return (
		<span className={cn("text-xs text-t3 leading-relaxed", className)}>
			{children}
		</span>
	);
}

interface OptionCardGroupProps {
	children: ReactNode;
	className?: string;
}

function OptionCardGroup({ children, className }: OptionCardGroupProps) {
	return <div className={cn("flex flex-col gap-2", className)}>{children}</div>;
}

export {
	OptionCard,
	OptionCardIcon,
	OptionCardContent,
	OptionCardLabel,
	OptionCardDescription,
	OptionCardGroup,
};
