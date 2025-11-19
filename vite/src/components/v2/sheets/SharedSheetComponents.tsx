import { useId } from "react";
import { Separator } from "@/components/v2/separator";
import { cn } from "@/lib/utils";
import { Checkbox } from "../checkboxes/Checkbox";

interface SheetHeaderProps {
	title: string;
	description: string | React.ReactNode;
	children?: React.ReactNode;
	noSeparator?: boolean;
	className?: string;
	isOnboarding?: boolean;
}

export function SheetHeader({
	title,
	description,
	children,
	noSeparator = false,
	className,
	isOnboarding = false,
}: SheetHeaderProps) {
	return (
		<div className={cn("p-4 pb-0", className)}>
			<h2 className="text-main mb-1">{title}</h2>
			{/* check typography */}
			<p
				className={cn("text-t3 text-sm", isOnboarding && "text-body-secondary")}
			>
				{description}
			</p>
			{children}
			{!noSeparator && <Separator className="mt-4" />}
		</div>
	);
}

interface SheetSectionProps {
	title?: string | React.ReactNode;
	description?: string | React.ReactNode;
	checked?: boolean;
	setChecked?: (checked: boolean) => void;

	children: React.ReactNode;
	withSeparator?: boolean;
}

export function SheetSection({
	title,
	description,
	checked = true,
	setChecked,

	children,
	withSeparator = true,
}: SheetSectionProps) {
	const id = useId();

	const withTogle = setChecked !== undefined;
	return (
		<>
			<div className="p-4">
				{title && (
					<label htmlFor={id} className="flex items-center gap-2 mb-2 w-fit">
						{withTogle && (
							<div className="flex items-center gap-2">
								<Checkbox
									id={id}
									checked={checked}
									onCheckedChange={setChecked}
								/>
							</div>
						)}
						{title && (
							<div className={cn("flex items-center gap-2")}>
								<h3 className={cn("text-sub select-none")}>{title}</h3>
							</div>
						)}
					</label>
				)}
				{description && (
					<p
						className={cn(
							"text-body-secondary mb-4",
							checked === false && "opacity-50",
						)}
					>
						{description}
					</p>
				)}
				{children}
			</div>
			{withSeparator && (
				<div className="px-4">
					<Separator />
				</div>
			)}
		</>
	);
}

interface SheetFooterProps {
	children: React.ReactNode;
	className?: string;
}

export function SheetFooter({ children, className }: SheetFooterProps) {
	return (
		<div
			className={cn(
				"mt-auto p-4 w-full flex-row grid grid-cols-2 gap-2 mb-2",
				className,
			)}
		>
			{children}
		</div>
	);
}
