import type { Feature } from "@autumn/shared";
import { CaretDownIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import type React from "react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./DropdownMenu";

export function FeatureSearchDropdown({
	features,
	value,
	onSelect,
	placeholder = "Select a feature",
	open,
	onOpenChange,
	renderExtra,
	footer,
	triggerClassName,
}: {
	features: Feature[];
	value: string | null;
	onSelect: (featureId: string) => void;
	placeholder?: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	renderExtra?: (feature: Feature) => React.ReactNode;
	footer?: React.ReactNode;
	triggerClassName?: string;
}) {
	const [internalOpen, setInternalOpen] = useState(false);
	const [search, setSearch] = useState("");

	const isControlled = open !== undefined;
	const isOpen = isControlled ? open : internalOpen;
	const setIsOpen = (next: boolean) => {
		if (!isControlled) setInternalOpen(next);
		onOpenChange?.(next);
		if (!next) setSearch("");
	};

	const selectedFeature = features.find((f) => f.id === value);

	const filteredFeatures = useMemo(
		() =>
			features.filter((f) =>
				f.name.toLowerCase().includes(search.toLowerCase()),
			),
		[features, search],
	);

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center justify-between w-full rounded-lg border bg-transparent text-sm outline-none h-input input-base input-shadow-default input-state-open p-2",
						triggerClassName,
					)}
				>
					{selectedFeature ? (
						<div className="flex items-center gap-2">
							<div className="shrink-0">
								{getFeatureIcon({ feature: selectedFeature })}
							</div>
							<span className="truncate">{selectedFeature.name}</span>
						</div>
					) : (
						<span className="text-subtle">{placeholder}</span>
					)}
					<CaretDownIcon className="size-4 opacity-50" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-(--anchor-width) p-0">
				<div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
					<MagnifyingGlassIcon className="size-3.5 text-subtle" />
					<input
						type="text"
						placeholder="Search features..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						onKeyDown={(e) => e.stopPropagation()}
						className="flex-1 bg-transparent text-xs outline-none placeholder:text-subtle"
					/>
				</div>
				<div className="max-h-56 overflow-y-auto p-1">
					{filteredFeatures.length === 0 ? (
						<div className="py-3 text-center text-xs text-subtle">
							No features found.
						</div>
					) : (
						filteredFeatures.map((feature: Feature) => (
							<DropdownMenuItem
								key={feature.id}
								onClick={() => {
									onSelect(feature.id);
									setIsOpen(false);
								}}
								className="py-1.5 px-2"
							>
								<div className="shrink-0">{getFeatureIcon({ feature })}</div>
								<span className="truncate flex-1">{feature.name}</span>
								{renderExtra?.(feature)}
							</DropdownMenuItem>
						))
					)}
				</div>
				{footer && (
					<div className="border-t border-border/40 p-1">{footer}</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
