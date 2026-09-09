import type { BillingControlKey, UsageLimitFilter } from "@autumn/shared";
import { usageLimitFilterKey } from "@autumn/shared";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { BillingControlPlanManagedSheetContent } from "./BillingControlPlanManagedSheetContent";

type KeyedControl = { feature_id?: string; filter?: UsageLimitFilter | null };

/** Remounts the content per item so a usage draft never carries over when the
 * open sheet switches to another plan-managed control. */
export function BillingControlPlanManagedSheet() {
	const sheetData = useSheetStore((s) => s.data);
	const controlKey = sheetData?.key as BillingControlKey | undefined;
	const item = sheetData?.item as KeyedControl | undefined;
	const itemKey = `${controlKey}:${item?.feature_id ?? ""}:${usageLimitFilterKey(item?.filter)}`;
	return <BillingControlPlanManagedSheetContent key={itemKey} />;
}
