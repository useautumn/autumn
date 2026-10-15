import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export type ChipOption = { value: string; label: string; icon?: ReactNode };

/** A locked group shows as one muted row listing its options. */
export type ChipOptionGroup = {
	label?: string;
	options: ChipOption[];
	locked?: boolean;
};

const CHIP_CLASS =
	"inline-flex items-center gap-1 rounded-md border bg-interactive-secondary px-1.5 py-0.5 text-foreground text-xs [&_svg]:size-3.5 [&_svg]:text-tertiary-foreground";

export const ChipMultiSelect = ({
	groups,
	value,
	onToggle,
	placeholder,
	lockNote,
	disabled,
	ariaLabel,
}: {
	groups: ChipOptionGroup[];
	value: string[];
	onToggle: (value: string) => void;
	placeholder: string;
	lockNote?: string | null;
	disabled?: boolean;
	ariaLabel: string;
}) => {
	const options = new Map(
		groups
			.flatMap((group) => group.options)
			.map((option) => [option.value, option]),
	);
	const picked = new Set(value);
	const selected = value.map(
		(key) => options.get(key) ?? { value: key, label: key },
	);
	const locked = groups.filter((group) => group.locked);
	// A saved choice missing from the loaded options still needs a row to uncheck it.
	const unknown = selected.filter((option) => !options.has(option.value));
	const menuGroups = [
		...(unknown.length > 0 ? [{ label: "Selected", options: unknown }] : []),
		...groups.filter((group) => !group.locked && group.options.length > 0),
	];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={ariaLabel}
				disabled={disabled}
				className="flex min-h-9 w-full cursor-pointer items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm input-base input-state-open-tiny disabled:cursor-default"
			>
				<span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
					{selected.length === 0 && (
						<span className="px-1 text-placeholder">{placeholder}</span>
					)}
					{selected.map((option) => (
						<span key={option.value} className={CHIP_CLASS}>
							{option.icon}
							{option.label}
						</span>
					))}
				</span>
				<CaretDownIcon className="size-3.5 shrink-0 text-tertiary-foreground" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="max-h-96 w-(--anchor-width)"
			>
				{menuGroups.map((group) => (
					<DropdownMenuGroup key={group.label ?? "options"}>
						{group.label && (
							<DropdownMenuLabel>{group.label}</DropdownMenuLabel>
						)}
						{group.options.map((option) => (
							<DropdownMenuCheckboxItem
								key={option.value}
								checked={picked.has(option.value)}
								onCheckedChange={() => onToggle(option.value)}
							>
								{option.icon}
								{option.label}
							</DropdownMenuCheckboxItem>
						))}
					</DropdownMenuGroup>
				))}
				{locked.length > 0 && (
					<>
						<DropdownMenuSeparator />
						{lockNote && (
							<p className="px-2 py-1.5 text-subtle text-xs">{lockNote}</p>
						)}
						{locked.map((group) => (
							<div
								key={group.label}
								className="flex items-center justify-between gap-4 px-2 py-1.5 text-sm text-subtle"
							>
								<span>{group.label}</span>
								<span className="truncate text-xs">
									{group.options.map((option) => option.label).join(", ")}
								</span>
							</div>
						))}
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
