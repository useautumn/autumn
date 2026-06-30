import type {
	CatalogStripeMapping,
	CatalogStripeProduct,
} from "@autumn/shared";
import { IconTooltipButton, Skeleton } from "@autumn/ui";
import { CaretRightIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { cn } from "@/lib/utils";
import { MappingStatusBadge } from "./MappingStatusBadge";
import { StripeProductSelect } from "./StripeProductSelect";
import { useStripeProductLink } from "./useStripeProductLink";

export const MappingField = ({
	label,
	sublabel,
	status,
	statusPending,
	stripeProductId,
	stripeProducts,
	knownProducts,
	onStripeProductChange,
	onSearchChange,
	isSearching,
	disabled,
	expanded,
	onToggleExpanded,
}: {
	label: ReactNode;
	sublabel?: ReactNode;
	status: CatalogStripeMapping["status"];
	statusPending?: boolean;
	stripeProductId: string | null;
	stripeProducts: CatalogStripeProduct[];
	knownProducts?: CatalogStripeProduct[];
	onStripeProductChange: (stripeProductId: string | null) => void;
	onSearchChange: (search: string) => void;
	isSearching: boolean;
	disabled?: boolean;
	expanded?: boolean;
	onToggleExpanded?: () => void;
}) => {
	const getStripeProductHref = useStripeProductLink();

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex min-w-0 items-center gap-2">
				{onToggleExpanded ? (
					<button
						aria-expanded={expanded}
						className="group flex min-w-0 flex-1 items-center gap-2 text-left"
						onClick={onToggleExpanded}
						type="button"
					>
						<CaretRightIcon
							className={cn(
								"-ml-1 shrink-0 text-tertiary-foreground transition-transform duration-150 group-hover:text-foreground",
								expanded && "rotate-90",
							)}
							size={12}
						/>
						<span className="truncate font-medium text-sm">{label}</span>
						{sublabel}
					</button>
				) : (
					<>
						<span className="truncate font-medium text-sm">{label}</span>
						{sublabel}
					</>
				)}
				{statusPending ? (
					<Skeleton className="ml-auto h-5 w-16 shrink-0" />
				) : (
					<MappingStatusBadge className="ml-auto shrink-0" status={status} />
				)}
			</div>

			<div className="flex items-center gap-2">
				<div className="min-w-0 flex-1">
					<StripeProductSelect
						disabled={disabled}
						isLoading={isSearching}
						knownProducts={knownProducts}
						onChange={onStripeProductChange}
						onSearchChange={onSearchChange}
						products={stripeProducts}
						value={stripeProductId}
					/>
				</div>
				{stripeProductId && (
					<IconTooltipButton
						icon={<StripeIcon size={14} />}
						onClick={() =>
							window.open(
								getStripeProductHref(stripeProductId),
								"_blank",
								"noopener,noreferrer",
							)
						}
						tooltip="Open in Stripe"
					/>
				)}
			</div>
		</div>
	);
};
