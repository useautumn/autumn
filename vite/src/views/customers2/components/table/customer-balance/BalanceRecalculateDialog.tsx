import {
	type Entity,
	type FullCusEntWithFullCusProduct,
	fullCustomerToCustomerEntitlements,
	numberWithCommas,
} from "@autumn/shared";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	ShortcutButton,
	Skeleton,
} from "@autumn/ui";
import { UserIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { getCustomerBalanceSourceParts } from "./customerBalanceUtils";
import { useRecalculateBalancePreview } from "./useRecalculateBalancePreview";
import { useRecalculateBalances } from "./useRecalculateBalances";

export function BalanceRecalculateDialog({
	balance,
	entityId,
	open,
	onOpenChange,
}: {
	balance: FullCusEntWithFullCusProduct | null;
	entityId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { customer } = useCusQuery();
	const preview = useRecalculateBalancePreview({
		balance,
		entityId,
		enabled: open,
	});
	const { mutate, isPending } = useRecalculateBalances({ entityId });

	const entities: Entity[] = customer?.entities ?? [];
	const selectedEntity = entities.find(
		(entity) => entity.id === entityId || entity.internal_id === entityId,
	);
	const ents =
		balance && customer
			? fullCustomerToCustomerEntitlements({
					fullCustomer: customer,
					featureId: balance.entitlement.feature.id,
					entity: selectedEntity,
				})
			: [];
	const entById = new Map(ents.map((ent) => [ent.id, ent]));
	const changedRows = (preview.data?.entitlements ?? []).filter(
		(row) => row.before_remaining !== row.after_remaining,
	);
	const featureName = balance?.entitlement.feature.name ?? "this feature";

	const handleConfirm = () => {
		if (!balance) return;
		mutate({ balance }, { onSuccess: () => onOpenChange(false) });
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Recalculate {featureName}</DialogTitle>
					<DialogDescription>
						Usage is redistributed so balances with remaining absorb the
						overage. The total stays the same.
					</DialogDescription>
				</DialogHeader>

				{preview.isFetching && (
					<div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
						<div className="flex items-center justify-between gap-4 px-3 py-2">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-4 w-12" />
						</div>
						<div className="flex items-center justify-between gap-4 px-3 py-2">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-4 w-12" />
						</div>
					</div>
				)}

				{!preview.isFetching && changedRows.length > 0 && (
					<div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
						{changedRows.map((row) => {
							const ent = entById.get(row.customer_entitlement_id);
							const parts = ent
								? getCustomerBalanceSourceParts({ balance: ent, entities })
								: null;
							const label = parts
								? [parts.productName, parts.intervalLabel]
										.filter(Boolean)
										.join(" · ")
								: row.customer_entitlement_id;
							const isIncrease = row.after_remaining > row.before_remaining;
							return (
								<div
									key={row.customer_entitlement_id}
									className="flex items-center justify-between gap-4 px-3 py-2"
								>
									<div className="flex min-w-0 items-center gap-2">
										<span className="truncate text-sm text-muted-foreground">
											{label}
										</span>
										{parts?.entityName && (
											<span className="text-tiny-id inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
												<UserIcon size={10} weight="bold" />
												{parts.entityName}
											</span>
										)}
									</div>
									<div className="flex shrink-0 items-center gap-2 text-sm tabular-nums">
										<span className="text-tertiary-foreground line-through">
											{numberWithCommas(row.before_remaining)}
										</span>
										<span
											className={cn(
												"font-medium",
												isIncrease
													? "text-emerald-600 dark:text-emerald-400"
													: "text-red-600 dark:text-red-400",
											)}
										>
											{numberWithCommas(row.after_remaining)}
										</span>
									</div>
								</div>
							);
						})}
					</div>
				)}

				{!preview.isFetching && preview.isError && (
					<p className="text-sm text-red-600 dark:text-red-400">
						Couldn't load the preview. Please try again.
					</p>
				)}

				{!preview.isFetching &&
					!preview.isError &&
					changedRows.length === 0 && (
						<p className="text-sm text-tertiary-foreground">
							These balances are already up to date.
						</p>
					)}

				<DialogFooter>
					<ShortcutButton
						variant="primary"
						metaShortcut="enter"
						onClick={handleConfirm}
						isLoading={isPending}
						disabled={preview.isFetching || changedRows.length === 0}
						className="w-full"
					>
						Recalculate
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
