import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { Check, Minus, X } from "lucide-react";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../lib/format.ts";

// ---- button ---------------------------------------------------------------

const BUTTON_VARIANTS = {
	primary:
		"bg-accent text-accent-fg hover:opacity-90 border border-transparent",
	secondary:
		"bg-surface text-fg border border-line hover:bg-hover hover:border-line-strong shadow-xs",
	ghost: "text-muted hover:text-fg hover:bg-hover border border-transparent",
	danger: "bg-bad text-white hover:opacity-90 border border-transparent",
} as const;

const BUTTON_SIZES = {
	sm: "h-7 px-2.5 text-xs gap-1.5",
	md: "h-8 px-3 text-[13px] gap-2",
	icon: "size-7 justify-center",
} as const;

type ButtonStyle = {
	variant?: keyof typeof BUTTON_VARIANTS;
	size?: keyof typeof BUTTON_SIZES;
};

/** Button look for non-button elements (router links). */
export const buttonClass = ({
	variant = "secondary",
	size = "sm",
}: ButtonStyle = {}) =>
	cn(
		"inline-flex shrink-0 cursor-pointer items-center rounded-md font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-info/50 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:shrink-0",
		BUTTON_VARIANTS[variant],
		BUTTON_SIZES[size],
	);

export const Button = ({
	variant,
	size,
	className,
	type = "button",
	...props
}: ComponentProps<"button"> & ButtonStyle) => (
	<button
		type={type}
		className={cn(buttonClass({ variant, size }), className)}
		{...props}
	/>
);

// ---- inputs ---------------------------------------------------------------

export const Input = ({ className, ...props }: ComponentProps<"input">) => (
	<input
		className={cn(
			"h-8 w-full min-w-0 rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg outline-none transition-colors placeholder:text-faint focus:border-line-strong focus-visible:ring-2 focus-visible:ring-info/30",
			className,
		)}
		{...props}
	/>
);

export const Field = ({
	label,
	hint,
	className,
	inputClassName,
	...props
}: ComponentProps<"input"> & {
	label: string;
	hint?: string;
	inputClassName?: string;
}) => {
	const id = useId();
	return (
		<div className={cn("space-y-1.5", className)}>
			<label htmlFor={id} className="block text-[11px] font-medium text-muted">
				{label} {hint && <span className="font-normal text-faint">{hint}</span>}
			</label>
			<Input id={id} className={inputClassName} {...props} />
		</div>
	);
};

export const Kbd = ({ children }: { children: ReactNode }) => (
	<kbd className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded border border-line bg-raised px-1 font-mono text-[10px] text-muted">
		{children}
	</kbd>
);

export const Checkbox = ({
	checked,
	indeterminate,
	onCheckedChange,
	label,
}: {
	checked: boolean;
	indeterminate?: boolean;
	onCheckedChange: (checked: boolean) => void;
	label: string;
}) => (
	<BaseCheckbox.Root
		checked={checked}
		indeterminate={indeterminate}
		onCheckedChange={(value) => onCheckedChange(value)}
		aria-label={label}
		className="flex size-3.5 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-line-strong bg-surface outline-none transition-colors focus-visible:ring-2 focus-visible:ring-info/40 data-[checked]:border-accent data-[checked]:bg-accent data-[indeterminate]:border-accent data-[indeterminate]:bg-accent"
	>
		<BaseCheckbox.Indicator className="text-accent-fg">
			{indeterminate ? (
				<Minus className="size-2.5" strokeWidth={3} />
			) : (
				<Check className="size-2.5" strokeWidth={3} />
			)}
		</BaseCheckbox.Indicator>
	</BaseCheckbox.Root>
);

/** Compact single-choice filter (accessible radio group). */
export const Segmented = <T extends string>({
	value,
	onChange,
	options,
	label,
	className,
}: {
	value: T;
	onChange: (value: T) => void;
	options: readonly { value: T; label: ReactNode }[];
	label: string;
	className?: string;
}) => (
	<RadioGroup
		value={value}
		onValueChange={(v) => onChange(v as T)}
		aria-label={label}
		className={cn(
			"flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5",
			className,
		)}
	>
		{options.map((o) => (
			<Radio.Root
				key={o.value}
				value={o.value}
				className="flex h-6 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded px-2 text-xs whitespace-nowrap text-muted transition-colors outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-info/40 data-[checked]:bg-raised data-[checked]:text-fg"
			>
				{o.label}
			</Radio.Root>
		))}
	</RadioGroup>
);

// ---- surfaces -------------------------------------------------------------

export const Card = ({ className, ...props }: ComponentProps<"div">) => (
	<div
		className={cn("rounded-lg border border-line bg-surface", className)}
		{...props}
	/>
);

export const SectionTitle = ({
	children,
	right,
	className,
}: {
	children: ReactNode;
	right?: ReactNode;
	className?: string;
}) => (
	<div className={cn("flex h-8 items-center justify-between gap-3", className)}>
		<h2 className="text-xs font-medium text-muted">{children}</h2>
		{right}
	</div>
);

export const Skeleton = ({ className }: { className?: string }) => (
	<div className={cn("twd-pulse rounded bg-raised", className)} />
);

export const Empty = ({
	title,
	body,
	action,
}: {
	title: string;
	body?: string;
	action?: ReactNode;
}) => (
	<div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
		<p className="text-[13px] font-medium text-fg">{title}</p>
		{body && <p className="max-w-sm text-xs text-pretty text-muted">{body}</p>}
		{action && <div className="mt-2">{action}</div>}
	</div>
);

// ---- tooltip --------------------------------------------------------------

export const TooltipProvider = BaseTooltip.Provider;

export const Tooltip = ({
	content,
	children,
	side = "top",
}: {
	content: ReactNode;
	children: ComponentProps<typeof BaseTooltip.Trigger>["render"];
	side?: "top" | "bottom" | "left" | "right";
}) => (
	<BaseTooltip.Root>
		<BaseTooltip.Trigger render={children} />
		<BaseTooltip.Portal>
			<BaseTooltip.Positioner side={side} sideOffset={6} className="z-50">
				<BaseTooltip.Popup className="max-w-sm rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg shadow-md">
					{content}
				</BaseTooltip.Popup>
			</BaseTooltip.Positioner>
		</BaseTooltip.Portal>
	</BaseTooltip.Root>
);

// ---- dialogs --------------------------------------------------------------

const backdrop =
	"fixed inset-0 z-40 bg-black/40 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0";

export const Dialog = ({
	open,
	onOpenChange,
	title,
	description,
	children,
	footer,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: ReactNode;
	children?: ReactNode;
	footer?: ReactNode;
}) => (
	<BaseDialog.Root open={open} onOpenChange={onOpenChange}>
		<BaseDialog.Portal>
			<BaseDialog.Backdrop className={backdrop} />
			<BaseDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-5 shadow-xl outline-none transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
				<BaseDialog.Title className="text-sm font-semibold text-balance">
					{title}
				</BaseDialog.Title>
				{description && (
					<BaseDialog.Description className="mt-1.5 text-[13px] text-pretty text-muted">
						{description}
					</BaseDialog.Description>
				)}
				{children && <div className="mt-4">{children}</div>}
				{footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
			</BaseDialog.Popup>
		</BaseDialog.Portal>
	</BaseDialog.Root>
);

export const ConfirmDialog = ({
	open,
	onOpenChange,
	title,
	children,
	confirmLabel,
	onConfirm,
	pending,
	destructive,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	children: ReactNode;
	confirmLabel: string;
	onConfirm: () => void;
	pending?: boolean;
	destructive?: boolean;
}) => (
	<AlertDialog.Root open={open} onOpenChange={onOpenChange}>
		<AlertDialog.Portal>
			<AlertDialog.Backdrop className={backdrop} />
			<AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-5 shadow-xl outline-none transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
				<AlertDialog.Title className="text-sm font-semibold text-balance">
					{title}
				</AlertDialog.Title>
				<AlertDialog.Description
					render={<div />}
					className="mt-2 text-[13px] text-pretty text-muted"
				>
					{children}
				</AlertDialog.Description>
				<div className="mt-5 flex justify-end gap-2">
					<AlertDialog.Close render={<Button>Cancel</Button>} />
					<Button
						variant={destructive ? "danger" : "primary"}
						disabled={pending}
						onClick={onConfirm}
					>
						{confirmLabel}
					</Button>
				</div>
			</AlertDialog.Popup>
		</AlertDialog.Portal>
	</AlertDialog.Root>
);

export const Drawer = ({
	open,
	onOpenChange,
	title,
	subtitle,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	subtitle?: ReactNode;
	children: ReactNode;
}) => (
	<BaseDialog.Root open={open} onOpenChange={onOpenChange}>
		<BaseDialog.Portal>
			<BaseDialog.Backdrop className={backdrop} />
			<BaseDialog.Popup className="fixed inset-y-0 right-0 z-50 flex w-[min(52rem,100vw)] flex-col border-l border-line bg-surface shadow-2xl outline-none transition-transform duration-200 ease-out data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full">
				<div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
					<div className="min-w-0">
						<BaseDialog.Title className="truncate font-mono text-[13px] font-medium">
							{title}
						</BaseDialog.Title>
						{subtitle && (
							<div className="mt-0.5 text-xs text-muted">{subtitle}</div>
						)}
					</div>
					<BaseDialog.Close
						render={
							<Button variant="ghost" size="icon" aria-label="Close">
								<X />
							</Button>
						}
					/>
				</div>
				<div className="min-h-0 flex-1 overflow-auto">{children}</div>
			</BaseDialog.Popup>
		</BaseDialog.Portal>
	</BaseDialog.Root>
);
