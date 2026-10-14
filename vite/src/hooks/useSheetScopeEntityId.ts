import { CusProductStatus, type FullCustomer } from "@autumn/shared";
import { useMemo, useState } from "react";

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

export function getInitialScopeEntityId(
	customer: FullCustomer | undefined,
): string | undefined {
	const fromUrl =
		new URLSearchParams(window.location.search).get("entity_id") ?? undefined;
	return fromUrl ?? pickDefaultScopeEntityId({ customer });
}

export function useSheetScopeEntityId(customer: FullCustomer | undefined) {
	const initial = useMemo(() => getInitialScopeEntityId(customer), [customer]);
	return useState<string | undefined>(initial);
}
