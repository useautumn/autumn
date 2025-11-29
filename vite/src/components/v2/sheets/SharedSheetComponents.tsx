import { CaretRightIcon } from "@phosphor-icons/react";
import { useId } from "react";
import { Separator } from "@/components/v2/separator";
import { type SheetType, useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { Checkbox } from "../checkboxes/Checkbox";

interface SheetHeaderProps {
	title: string;
	description: string | React.ReactNode;
	children?: React.ReactNode;
	noSeparator?: boolean;
	className?: string;
	isOnboarding?: boolean;
	breadcrumbs?: { name: string; sheet?: string }[];
	itemId?: string | null;
}

export function SheetHeader({
	title,
	description,
	children,
	breadcrumbs,
	noSeparator = false,
	className,
	isOnboarding = false,
	itemId,
}: SheetHeaderProps) {
	return (
		<div className={cn("p-4 pb-0", className)}>
			{breadcrumbs ? (
				<SheetBreadcrumbs
					breadcrumbs={breadcrumbs}
					title={title}
					itemId={itemId ?? null}
				/>
			) : (
				<h2 className="text-main">{title}</h2>
			)}
			<p
				className={cn(
					"text-t3 text-sm mt-1",
					isOnboarding && "text-body-secondary",
				)}
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
	className?: string;
}

export function SheetSection({
	title,
	className,
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
			<div className={cn("p-4", className)}>
				{title && (
					<div className="flex items-center justify-between h-6 mb-2">
						<label
							htmlFor={id}
							className="flex items-center gap-2 w-full justify-between h-6"
						>
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
					</div>
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

export function SheetBreadcrumbs({
	breadcrumbs,
	title,
	itemId,
}: {
	breadcrumbs: { name: string; sheet?: string }[];
	title: string;
	itemId: string | null;
}) {
	const setSheet = useSheetStore((s) => s.setSheet);
	return (
		<div className="flex items-center gap-1">
			{breadcrumbs.map((breadcrumb) => (
				<button
					type="button"
					key={breadcrumb.name}
					className="flex items-center gap-1 text-t3 cursor-pointer"
					onClick={() => {
						if (breadcrumb.sheet) {
							setSheet({ type: breadcrumb.sheet as SheetType, itemId: itemId });
						}
					}}
				>
					<h2 className="text-t3! text-main">{breadcrumb.name}</h2>
					<CaretRightIcon size={14} />
				</button>
			))}
			<h2 className="text-main">{title}</h2>
		</div>
	);
}
