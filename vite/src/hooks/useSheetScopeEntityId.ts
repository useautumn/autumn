import { CusProductStatus, type FullCustomer } from "@autumn/shared";
import { useMemo, useState } from "react";

// If the customer has no active customer-level plan but has at least one
// active entity-level plan, default scope to that entity. Otherwise stay
// customer-scoped.
function pickDefaultScopeEntityId({
	customer,
}: {
	customer: FullCustomer | undefined;
}): string | undefined {
	const activePlans =
		customer?.customer_products?.filter(
			(cp) => cp.status === CusProductStatus.Active && !cp.canceled_at,
		) ?? [];

	if (activePlans.some((cp) => !cp.entity_id)) return undefined;
	return activePlans.find((cp) => !!cp.entity_id)?.entity_id ?? undefined;
}

/** The scope the sheet seeds to: URL `entity_id` param, else the smart default. */
export function getInitialScopeEntityId(
	customer: FullCustomer | undefined,
): string | undefined {
	const fromUrl =
		new URLSearchParams(window.location.search).get("entity_id") ?? undefined;
	return fromUrl ?? pickDefaultScopeEntityId({ customer });
}

// Sheet-local scope state for Attach / Create Schedule flows. Seeds from the
// `entity_id` URL param if present, otherwise applies the smart default based
// on the customer's existing plans. Changes stay local to the sheet.
export function useSheetScopeEntityId(customer: FullCustomer | undefined) {
	const initial = useMemo(() => getInitialScopeEntityId(customer), [customer]);
	return useState<string | undefined>(initial);
}
