import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { CheckIcon, PlusIcon, UserIcon, XIcon } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { useCusSearchQueryV2 } from "@/views/customers/hooks/useCusSearchQuery";

const MAX_VISIBLE_CHIPS = 3;
const SEARCH_PAGE_SIZE = 50;
// Split pasted IDs on commas, semicolons, and newlines only — not spaces, so a
// name like "Hangzhou Short-Chain Network" stays a single search term.
const ID_SEPARATOR = /[\n\r,;]+/;

function parseIdList(text: string): string[] {
	return text
		.split(ID_SEPARATOR)
		.map((id) => id.trim())
		.filter(Boolean);
}

type CustomerLabel = { name?: string | null; email?: string | null };

export function CustomerValuePicker({
	selectedValues,
	onChange,
	className: triggerClassName,
	defaultOpen = false,
}: {
	selectedValues: string[];
	onChange: (values: string[]) => void;
	className?: string;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce({ value: search, delayMs: 250 });

	const { customers } = useCusSearchQueryV2({
		search: debouncedSearch,
		page_size: SEARCH_PAGE_SIZE,
	});

	// Remember labels for customers we've seen so chips for previously selected
	// (or pasted) ids can still resolve a name once out of the current results.
	const labelCache = useRef<Map<string, CustomerLabel>>(new Map());
	for (const customer of customers) {
		if (customer.id)
			labelCache.current.set(customer.id, {
				name: customer.name,
				email: customer.email,
			});
	}

	const chipLabel = (id: string) => {
		const cached = labelCache.current.get(id);
		return cached?.name ?? cached?.email ?? id;
	};

	const options = useMemo(
		() =>
			customers
				.filter((c): c is typeof c & { id: string } => Boolean(c.id))
				.map((c) => ({
					value: c.id,
					label: c.name ?? c.email ?? c.id,
				})),
		[customers],
	);

	const addValues = (ids: string[]) => {
		const next = [...selectedValues];
		for (const id of ids) if (!next.includes(id)) next.push(id);
		onChange(next);
	};

	const toggleValue = (id: string) => {
		if (selectedValues.includes(id))
			onChange(selectedValues.filter((v) => v !== id));
		else onChange([...selectedValues, id]);
	};

	const removeValue = (id: string) =>
		onChange(selectedValues.filter((v) => v !== id));

	const trimmedSearch = search.trim();
	const canAddRaw =
		trimmedSearch.length > 0 &&
		!options.some((o) => o.value === trimmedSearch) &&
		!selectedValues.includes(trimmedSearch);

	const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
		const ids = parseIdList(e.clipboardData.getData("text"));
		// Single token: let it land in the search box so the user can search.
		if (ids.length <= 1) return;
		e.preventDefault();
		addValues(ids);
		setSearch("");
	};

	return (
		<div className={cn("min-w-0", triggerClassName)}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex items-center gap-1.5 h-8 px-3 rounded-xl input-base input-state-open-tiny cursor-pointer min-w-0 w-full text-sm overflow-hidden"
					>
						{selectedValues.length === 0 ? (
							<span className="text-tertiary-foreground">
								Select or paste customer IDs...
							</span>
						) : (
							<>
								{selectedValues.slice(0, MAX_VISIBLE_CHIPS).map((val) => (
									<span
										key={val}
										className="flex items-center gap-0.5 bg-accent border border-border text-foreground rounded px-1 h-4.5 text-[10px] shrink-0 max-w-48"
									>
										<span className="shrink-0 [&_svg]:size-3">
											<UserIcon
												size={12}
												className="text-tertiary-foreground"
											/>
										</span>
										<span className="truncate">{chipLabel(val)}</span>
										<span
											className="cursor-pointer text-tertiary-foreground hover:text-destructive ml-0.5"
											onClick={(e) => {
												e.stopPropagation();
												removeValue(val);
											}}
											onPointerDown={(e) => e.stopPropagation()}
										>
											<XIcon size={10} />
										</span>
									</span>
								))}
								{selectedValues.length > MAX_VISIBLE_CHIPS && (
									<span className="text-sm text-tertiary-foreground px-1 shrink-0">
										+{selectedValues.length - MAX_VISIBLE_CHIPS}
									</span>
								)}
							</>
						)}
					</button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-(--anchor-width) p-0 z-200 rounded-md overflow-hidden"
					style={{
						transformOrigin: "var(--radix-popover-content-transform-origin)",
					}}
				>
					<Command className="bg-interactive-secondary" shouldFilter={false}>
						<CommandInput
							value={search}
							onValueChange={setSearch}
							onPaste={handlePaste}
							placeholder="Search or paste IDs..."
							className="text-sm"
						/>
						<CommandList>
							<CommandEmpty className="text-tertiary-foreground text-sm p-2">
								No customers found
							</CommandEmpty>
							<CommandGroup>
								{canAddRaw && (
									<CommandItem
										key="__add_raw__"
										value={`add:${trimmedSearch}`}
										onSelect={() => {
											addValues(parseIdList(trimmedSearch));
											setSearch("");
										}}
										className="text-sm"
									>
										<PlusIcon size={14} className="shrink-0" />
										<span className="flex-1 truncate">
											Add “{trimmedSearch}”
										</span>
									</CommandItem>
								)}
								{options.map((option) => {
									const isSelected = selectedValues.includes(option.value);
									return (
										<CommandItem
											key={option.value}
											value={option.value}
											onSelect={() => toggleValue(option.value)}
											className="text-sm"
										>
											<UserIcon
												size={14}
												className="shrink-0 text-tertiary-foreground"
											/>
											<span className="flex-1 truncate">{option.label}</span>
											{option.value !== option.label && (
												<span className="shrink-0 max-w-48 truncate text-tertiary-foreground text-xs font-mono">
													{option.value}
												</span>
											)}
											{isSelected && (
												<CheckIcon size={14} className="shrink-0" />
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
