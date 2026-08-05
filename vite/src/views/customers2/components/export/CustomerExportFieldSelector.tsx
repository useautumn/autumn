import {
	CUSTOMER_EXPORT_FIELD_HEADERS,
	CUSTOMER_EXPORT_FIELD_ORDER,
	type CustomerExportField,
} from "@autumn/shared";
import {
	Checkbox,
	cn,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { CheckIcon } from "@phosphor-icons/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";

const MAX_VISIBLE_CHIPS = 3;

function FooterAction({
	icon,
	label,
	onClick,
	className,
}: {
	icon: ReactNode;
	label: string;
	onClick: () => void;
	className: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex flex-1 cursor-default items-center justify-center gap-1.5 px-2 py-1.5 text-tertiary-foreground text-xs hover:bg-accent hover:text-muted-foreground",
				className,
			)}
		>
			{icon}
			{label}
		</button>
	);
}

export function CustomerExportFieldSelector({
	selectedFields,
	onChange,
}: {
	selectedFields: CustomerExportField[];
	onChange: (fields: CustomerExportField[]) => void;
}) {
	const toggleField = ({
		field,
		checked,
	}: {
		field: CustomerExportField;
		checked: boolean;
	}) => {
		onChange(
			checked
				? CUSTOMER_EXPORT_FIELD_ORDER.filter(
						(candidate) =>
							candidate === field || selectedFields.includes(candidate),
					)
				: selectedFields.filter((selected) => selected !== field),
		);
	};

	const orderedSelection = CUSTOMER_EXPORT_FIELD_ORDER.filter((field) =>
		selectedFields.includes(field),
	);
	const visibleFields = orderedSelection.slice(0, MAX_VISIBLE_CHIPS);
	const overflowCount = orderedSelection.length - visibleFields.length;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={`Export columns, ${orderedSelection.length} of ${CUSTOMER_EXPORT_FIELD_ORDER.length} selected`}
				className="input-base input-state-open-tiny flex h-8 w-full min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-xl px-3 text-sm"
			>
				{orderedSelection.length === 0 ? (
					<span className="text-tertiary-foreground">Select columns...</span>
				) : (
					<>
						{visibleFields.map((field) => (
							<span
								key={field}
								className="flex h-4.5 max-w-48 shrink-0 items-center gap-0.5 rounded border border-border bg-accent px-1 text-[10px] text-foreground"
							>
								<span className="truncate">
									{CUSTOMER_EXPORT_FIELD_HEADERS[field]}
								</span>
								<button
									type="button"
									aria-label={`Remove ${CUSTOMER_EXPORT_FIELD_HEADERS[field]} column`}
									className="ml-0.5 cursor-pointer text-tertiary-foreground hover:text-destructive"
									onClick={(e) => {
										e.stopPropagation();
										toggleField({ field, checked: false });
									}}
									onPointerDown={(e) => e.stopPropagation()}
								>
									<X size={10} />
								</button>
							</span>
						))}
						{overflowCount > 0 && (
							<span className="shrink-0 px-1 text-sm text-tertiary-foreground">
								+{overflowCount}
							</span>
						)}
					</>
				)}
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end" className="w-56 gap-0 p-0 font-regular">
				<DropdownMenuGroup className="p-1">
					{CUSTOMER_EXPORT_FIELD_ORDER.map((field) => {
						const isSelected = selectedFields.includes(field);
						return (
							<DropdownMenuItem
								key={field}
								closeOnClick={false}
								onClick={() => toggleField({ field, checked: !isSelected })}
								className="flex cursor-pointer items-center gap-2 text-sm"
							>
								<Checkbox checked={isSelected} className="border-border" />
								{CUSTOMER_EXPORT_FIELD_HEADERS[field]}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuGroup>

				<DropdownMenuSeparator className="m-0" />

				<div className="flex items-center">
					<FooterAction
						icon={<CheckIcon size={10} />}
						label="Select all"
						className="rounded-bl-lg"
						onClick={() => onChange([...CUSTOMER_EXPORT_FIELD_ORDER])}
					/>
					<FooterAction
						icon={<X size={10} />}
						label="Reset"
						className="rounded-br-lg"
						onClick={() => onChange([CUSTOMER_EXPORT_FIELD_ORDER[0]])}
					/>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
