import {
	type CreateInvoiceParams,
	type InvoiceCustomizeItem,
	orgMultiCurrencyEnabled,
} from "@autumn/shared";
import { planV1ToProductItems } from "@autumn/shared/api/products/mappers/planV1ToProductItems";
import { validateProductItems } from "@server/internal/products/product-items/validateProductItems.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const validateInvoiceCustomizeItems = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateInvoiceParams;
}) => {
	const itemLists: (InvoiceCustomizeItem[] | undefined)[] = (
		params.plans ?? []
	).flatMap((plan) => [
		plan.customize?.items,
		...(plan.license_quantities ?? []).map(
			(license) => license.customize?.items,
		),
	]);

	for (const customizeItems of itemLists) {
		if (!customizeItems?.length) continue;
		validateProductItems({
			newItems: planV1ToProductItems({
				ctx,
				plan: {
					items: customizeItems.map(({ feature_id, price }) => ({
						feature_id,
						included: 0,
						price,
					})),
					price: null,
				},
			}),
			features: ctx.features,
			orgId: ctx.org.id,
			env: ctx.env,
			multiCurrencyEnabled: orgMultiCurrencyEnabled({ org: ctx.org }),
			validateAuthoringRules: false,
		});
	}
};
