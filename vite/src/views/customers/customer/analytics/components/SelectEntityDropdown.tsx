import type { Entity } from "@autumn/shared";
import { CaretDownIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Check } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { cn } from "@/lib/utils";
import { useAnalyticsContext } from "../AnalyticsContext";

export const SelectEntityDropdown = () => {
	const [open, setOpen] = useState(false);
	const [searchValue, setSearchValue] = useState("");

	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const location = useLocation();

	const { customer } = useAnalyticsContext();

	const entities: Entity[] = customer?.entities || [];

	if (!customer || entities.length === 0) {
		return null;
	}

	const currentEntityId = searchParams.get("entity_id") || "";

	const updateQueryParams = ({ entityId }: { entityId: string | null }) => {
		const params = new URLSearchParams(location.search);

		if (entityId) {
			params.set("entity_id", entityId);
		} else {
			params.delete("entity_id");
		}

		navigate(`${location.pathname}?${params.toString()}`);
	};

	const filteredEntities = entities.filter((entity) => {
		const label = entity.name || entity.id || "";
		return label.toLowerCase().includes(searchValue.toLowerCase());
	});

	const handleSelect = ({ entityId }: { entityId: string | null }) => {
		updateQueryParams({ entityId });
		setOpen(false);
	};

	const currentEntity = entities.find((e) => e.id === currentEntityId);
	const displayLabel = currentEntity
		? `Entity: ${currentEntity.name || currentEntity.id}`
		: "Entity";

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<IconButton
					variant="secondary"
					size="default"
					icon={<CaretDownIcon size={12} weight="bold" />}
					iconOrientation="right"
					className={cn(open && "btn-secondary-active")}
				>
					{displayLabel}
				</IconButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[200px]">
				{entities.length > 5 && (
					<div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
						<MagnifyingGlassIcon className="size-4 text-t4" />
						<input
							type="text"
							placeholder="Search entities..."
							value={searchValue}
							onChange={(e) => setSearchValue(e.target.value)}
							onKeyDown={(e) => e.stopPropagation()}
							className="flex-1 bg-transparent text-sm outline-none placeholder:text-t4"
						/>
					</div>
				)}

				<div className="max-h-[300px] overflow-y-auto pt-1">
					<DropdownMenuItem
						onClick={() => handleSelect({ entityId: null })}
						className="flex items-center justify-between"
					>
						<span className="text-xs">All entities</span>
						{!currentEntityId && <Check className="ml-2 h-3 w-3 text-t3" />}
					</DropdownMenuItem>

					{entities.length > 0 && <DropdownMenuSeparator />}

					{filteredEntities.length === 0 && entities.length > 0 && (
						<div className="py-4 text-center text-sm text-t4">
							No entities found
						</div>
					)}

					{filteredEntities.map((entity) => (
						<DropdownMenuItem
							key={entity.id}
							onClick={() => handleSelect({ entityId: entity.id })}
							className="flex items-center justify-between"
						>
							<span className="text-xs font-mono truncate max-w-[150px]">
								{entity.name || entity.id}
							</span>
							{currentEntityId === entity.id && (
								<Check className="ml-2 h-3 w-3 text-t3 shrink-0" />
							)}
						</DropdownMenuItem>
					))}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
