import type { Entity, ProductV2, SyncPlanInstance } from "@autumn/shared";
import {
	BuildingsIcon,
	PackageIcon,
	PencilSimpleIcon,
	PuzzlePieceIcon,
	XIcon,
} from "@phosphor-icons/react";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import {
	applyCustomizeToProduct,
	getBasePriceLabel,
} from "./syncPlanRowUtils";

export type DraftPlan = SyncPlanInstance & { _key: string };

const CUSTOMER_LEVEL_VALUE = "";

const PriceLabel = ({
	label,
	isCustom,
}: {
	label: string;
	isCustom: boolean;
}) => (
	<span
		className={cn(
			"text-xs tabular-nums",
			isCustom ? "text-emerald-500 font-medium" : "text-t3",
		)}
	>
		{label}
	</span>
);

type EntityOption = Entity | null;

const EntityScopeSubRow = ({
	entities,
	scopeEntityId,
	onChange,
}: {
	entities: Entity[];
	scopeEntityId: string | undefined;
	onChange: (entityId: string | undefined) => void;
}) => {
	const entityOptions: EntityOption[] = [null, ...entities];
	return (
		<div className="ml-4 pl-3 border-l border-border/40">
			<SearchableSelect<EntityOption>
				value={scopeEntityId ?? CUSTOMER_LEVEL_VALUE}
				onValueChange={(value) =>
					onChange(value === CUSTOMER_LEVEL_VALUE ? undefined : value)
				}
				options={entityOptions}
				getOptionValue={(option) =>
					option === null
						? CUSTOMER_LEVEL_VALUE
						: option.id || option.internal_id
				}
				getOptionLabel={(option) =>
					option === null ? "Customer-level" : option.name || option.id || "PENDING"
				}
				triggerClassName="w-full h-input"
				placeholder="Select entity"
				searchable
				searchPlaceholder="Search entities..."
				emptyText="No entities found"
				renderValue={(option) =>
					option === null || option === undefined ? (
						<span className="text-t2 text-xs">Customer-level</span>
					) : (
						<span className="text-t2 text-xs truncate">
							{option.name || option.id || "PENDING"}
						</span>
					)
				}
				renderOption={(option, isSelected) => {
					if (option === null) {
						return (
							<>
								<span className="text-sm">Customer-level</span>
								{isSelected && <CheckIcon className="size-4 shrink-0" />}
							</>
						);
					}
					return (
						<>
							<div className="flex gap-2 items-center min-w-0 flex-1">
								{option.name && (
									<span className="text-sm shrink-0">{option.name}</span>
								)}
								<span className="truncate text-t3 font-mono text-xs min-w-0">
									{option.id || "PENDING"}
								</span>
							</div>
							{isSelected && <CheckIcon className="size-4 shrink-0" />}
						</>
					);
				}}
			/>
		</div>
	);
};

export function SyncPlanRow({
	plan,
	products,
	usedPlanIds,
	entities,
	onChange,
	onRemove,
	onCustomize,
}: {
	plan: DraftPlan;
	products: ProductV2[];
	usedPlanIds: Set<string>;
	entities: Entity[];
	onChange: (plan: DraftPlan) => void;
	onRemove: () => void;
	onCustomize: () => void;
}) {
	const { org } = useOrg();
	const currency = org?.default_currency ?? "USD";

	const availableProducts = products.filter((p) => !p.archived);
	const selectedProduct = products.find((p) => p.id === plan.plan_id);
	const hasCustomize = Boolean(plan.customize);
	const hasEntityScope = Boolean(plan.internal_entity_id);

	const [scopeOpen, setScopeOpen] = useState<boolean>(hasEntityScope);

	if (!plan.plan_id) {
		return (
			<SearchableSelect
				value={null}
				onValueChange={(value) => onChange({ ...plan, plan_id: value })}
				options={availableProducts}
				getOptionValue={(product) => product.id}
				getOptionLabel={(product) => product.name}
				getOptionDisabled={(product) => usedPlanIds.has(product.id)}
				renderOption={(product) => (
					<>
						<span className="flex-1 truncate min-w-0">{product.name}</span>
						{usedPlanIds.has(product.id) && (
							<span className="text-xs text-t4 shrink-0">Already added</span>
						)}
					</>
				)}
				placeholder="Select plan…"
				searchable
				searchPlaceholder="Search plans..."
				emptyText="No plans found"
				defaultOpen
			/>
		);
	}

	const isAddOn = selectedProduct?.is_add_on === true;
	const customizedProduct = selectedProduct
		? applyCustomizeToProduct({
				product: selectedProduct,
				customize: plan.customize,
			})
		: null;

	const originalPriceLabel = selectedProduct
		? getBasePriceLabel({ product: selectedProduct, currency })
		: null;
	const currentPriceLabel = customizedProduct
		? getBasePriceLabel({ product: customizedProduct, currency })
		: null;
	const isPriceCustom =
		hasCustomize &&
		originalPriceLabel !== null &&
		currentPriceLabel !== null &&
		originalPriceLabel !== currentPriceLabel;

	return (
		<div className="space-y-1.5">
			<div
				className={cn(
					"group flex h-input min-w-0 w-full items-center gap-2 rounded-lg",
					"input-base input-shadow-default px-3 text-sm text-t1",
				)}
			>
				{isAddOn ? (
					<PuzzlePieceIcon className="size-3.5 shrink-0 text-t3" />
				) : (
					<PackageIcon className="size-3.5 shrink-0 text-t3" />
				)}
				<span className="flex-1 truncate min-w-0">
					{selectedProduct?.name ?? plan.plan_id}
				</span>

				{isAddOn && (
					<Input
						type="number"
						min={1}
						value={plan.quantity ?? 1}
						onChange={(e) => {
							const next = Number.parseInt(e.target.value, 10);
							onChange({
								...plan,
								quantity: Number.isFinite(next) && next >= 1 ? next : 1,
							});
						}}
						className="w-14 h-7 text-center text-xs"
					/>
				)}

				<div className="relative flex shrink-0 items-center gap-1.5 min-w-[60px] justify-end">
					<div
						className={cn(
							"flex items-center gap-1.5 transition-opacity duration-150",
							"group-hover:opacity-0",
						)}
					>
						{hasCustomize && (
							<Badge variant="green" size="sm">
								Custom
							</Badge>
						)}
						{currentPriceLabel && (
							<PriceLabel
								label={currentPriceLabel}
								isCustom={isPriceCustom}
							/>
						)}
					</div>
					<div
						className={cn(
							"absolute right-0 flex items-center gap-1 transition-opacity duration-150",
							"opacity-0 group-hover:opacity-100",
						)}
					>
						{entities.length > 0 && (
							<Button
								variant="ghost"
								size="icon"
								className={cn(
									"h-6 w-6",
									scopeOpen || hasEntityScope
										? "text-primary"
										: "text-t3 hover:text-t1",
								)}
								onClick={() => setScopeOpen((v) => !v)}
								aria-label="Set entity scope"
							>
								<BuildingsIcon size={13} />
							</Button>
						)}
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6 text-t3 hover:text-t1"
							onClick={onCustomize}
						>
							<PencilSimpleIcon size={13} />
						</Button>
						<button
							type="button"
							className="p-1 text-t4 hover:text-destructive transition-colors"
							onClick={onRemove}
						>
							<XIcon size={13} />
						</button>
					</div>
				</div>
			</div>

			{entities.length > 0 && scopeOpen && (
				<EntityScopeSubRow
					entities={entities}
					scopeEntityId={plan.internal_entity_id}
					onChange={(entityId) =>
						onChange({ ...plan, internal_entity_id: entityId })
					}
				/>
			)}
		</div>
	);
}
