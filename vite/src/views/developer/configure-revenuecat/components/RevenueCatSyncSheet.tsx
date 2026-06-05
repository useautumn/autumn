import { WarningIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/v2/badges/Badge";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { Sheet, SheetContent } from "@/components/v2/sheets/Sheet";
import { useOrg } from "@/hooks/common/useOrg";
import {
	type RCPreflightItem,
	useRCPreflight,
} from "@/hooks/queries/revcat/useRCPreflight";
import { useRCSync } from "@/hooks/queries/revcat/useRCSync";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";

interface RevenueCatSyncSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

type SyncAction = "create" | "rename" | "in_sync";

const formatPrice = (amountMicros: number, currency: string) =>
	`${(amountMicros / 1_000_000).toLocaleString(undefined, {
		style: "currency",
		currency,
	})}`;

const getPriceWarning = (item?: RCPreflightItem): string | null => {
	if (!item?.rc_exists || !item.autumn_price) return null;
	if (!item.rc_price) return "No store price set";
	if (item.rc_price.amount_micros !== item.autumn_price.amount_micros) {
		return `Autumn ${formatPrice(item.autumn_price.amount_micros, item.autumn_price.currency)} ≠ store ${formatPrice(item.rc_price.amount_micros, item.rc_price.currency)}`;
	}
	return null;
};

export function RevenueCatSyncSheet({
	open,
	onOpenChange,
}: RevenueCatSyncSheetProps) {
	const env = useEnv();
	const { org } = useOrg();
	const { products, isLoading: productsLoading } = useProductsQuery();
	const { items: preflight, isLoading: preflightLoading } = useRCPreflight({
		enabled: open,
	});
	const { sync, isSyncing } = useRCSync();

	const [selected, setSelected] = useState<Record<string, boolean>>({});

	const rows = useMemo(() => {
		const byPlan = new Map(preflight.map((item) => [item.plan_id, item]));
		return (products ?? []).map((product) => {
			const item = byPlan.get(product.id);
			const name = product.name || product.id;
			let action: SyncAction = "create";
			if (item?.rc_exists) {
				action = item.rc_name !== name ? "rename" : "in_sync";
			}
			return {
				id: product.id,
				name,
				action,
				priceWarning: getPriceWarning(item),
			};
		});
	}, [products, preflight]);

	const selectedIds = Object.keys(selected).filter((id) => selected[id]);
	const isLoading = productsLoading || preflightLoading;

	const handleSync = async () => {
		if (selectedIds.length === 0) return;
		try {
			const results = await sync(selectedIds);
			const synced = results.filter((r) => r.status === "synced").length;
			const skipped = results.filter((r) => r.status === "skipped").length;
			const errored = results.filter((r) => r.status === "error").length;
			toast.success(
				`Synced ${synced} plan(s)${skipped ? `, ${skipped} skipped` : ""}${errored ? `, ${errored} failed` : ""}`,
			);
			setSelected({});
			onOpenChange(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to sync products"));
		}
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex flex-col overflow-hidden">
				<SheetHeader
					title="Sync products to RevenueCat"
					description="Create or rename the matching products in RevenueCat. Names sync; prices do not."
					noSeparator
				/>

				<div className="px-4 pt-3">
					<div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-amber-600 dark:text-amber-500">
						<WarningIcon className="mt-0.5 h-4 w-4 shrink-0" weight="fill" />
						<p className="text-[12px] leading-snug">
							Test Store prices are set automatically from each plan's price. Real
							App Store / Google Play prices are owned by Apple/Google — set or
							confirm those in App Store Connect / Play Console.
						</p>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto px-4 pt-3">
					{isLoading ? (
						<div className="space-y-2">
							<Skeleton className="h-10 w-full rounded-lg" />
							<Skeleton className="h-10 w-full rounded-lg" />
						</div>
					) : rows.length === 0 ? (
						<div className="text-tertiary-foreground text-sm py-1">
							No plans found.
						</div>
					) : (
						<div className="flex flex-col gap-0.5">
							{rows.map((row) => {
								const isSelected = !!selected[row.id];
								return (
									<button
										type="button"
										key={row.id}
										aria-pressed={isSelected}
										className={cn(
											"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
											"focus-visible:ring-2 focus-visible:ring-ring/40",
											isSelected
												? "bg-interactive-secondary"
												: "hover:bg-interactive-secondary/50",
										)}
										onClick={() =>
											setSelected((s) => ({ ...s, [row.id]: !s[row.id] }))
										}
									>
										<Checkbox
											checked={isSelected}
											className="pointer-events-none"
										/>
										<div className="flex min-w-0 flex-1 flex-col gap-0.5">
											<span className="truncate text-body font-medium text-foreground">
												{row.name}
											</span>
											<span className="truncate font-mono text-[11px] leading-none text-tertiary-foreground">
												{row.id}
											</span>
										</div>
										<div className="flex shrink-0 items-center gap-1.5">
											{row.priceWarning && (
												<Badge
													variant="muted"
													size="sm"
													className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-500"
												>
													{row.priceWarning}
												</Badge>
											)}
											{row.action === "in_sync" ? (
												<Badge variant="green" size="sm">
													In sync
												</Badge>
											) : (
												<Badge variant="muted" size="sm">
													{row.action === "create" ? "Create" : "Rename"}
												</Badge>
											)}
										</div>
									</button>
								);
							})}
						</div>
					)}
				</div>

				<SheetFooter>
					<ShortcutButton
						variant="secondary"
						className="w-full"
						onClick={() => onOpenChange(false)}
						singleShortcut="escape"
					>
						Cancel
					</ShortcutButton>
					<ShortcutButton
						className="w-full"
						onClick={handleSync}
						metaShortcut="enter"
						isLoading={isSyncing}
						disabled={selectedIds.length === 0}
					>
						Sync {selectedIds.length || ""}
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
