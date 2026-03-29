import {
	type AutoTopup,
	cusEntsToBalance,
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
	type FullCusEntWithFullCusProduct,
	nullish,
	PurchaseLimitInterval,
} from "@autumn/shared";
import { useAppForm } from "@/hooks/form/form";
import {
	type BalanceEditForm,
	BalanceEditFormSchema,
} from "./balanceEditFormSchema";

export function useBalanceEditForm({
	selectedCusEnt,
	entityId,
	existingAutoTopUp,
}: {
	selectedCusEnt: FullCusEntWithFullCusProduct;
	entityId: string | null;
	existingAutoTopUp: AutoTopup | null;
}) {
	const prepaidAllowance = cusEntsToPrepaidQuantity({
		cusEnts: [selectedCusEnt],
		sumAcrossEntities: nullish(entityId),
	});

	const balance = cusEntsToBalance({
		cusEnts: [selectedCusEnt],
		entityId: entityId ?? undefined,
		withRollovers: false,
	});

	const grantedBalance = cusEntsToGrantedBalance({
		cusEnts: [selectedCusEnt],
		entityId: entityId ?? undefined,
	});

	const grantedAndPurchasedBalance = grantedBalance + prepaidAllowance;

	const form = useAppForm({
		defaultValues: {
			mode: "set",
			balance: balance ?? null,
			grantedAndPurchasedBalance: grantedAndPurchasedBalance ?? null,
			nextResetAt: selectedCusEnt.next_reset_at ?? null,
			addValue: null,
			autoTopUp: {
				enabled: existingAutoTopUp?.enabled ?? false,
				threshold: existingAutoTopUp?.threshold ?? null,
				quantity: existingAutoTopUp?.quantity ?? null,
				maxPurchasesEnabled: !!existingAutoTopUp?.purchase_limit,
				interval:
					existingAutoTopUp?.purchase_limit?.interval ??
					PurchaseLimitInterval.Month,
				maxPurchases: existingAutoTopUp?.purchase_limit?.limit ?? null,
			},
		} as BalanceEditForm,
		validators: {
			onChange: BalanceEditFormSchema,
		},
	});

	return Object.assign(form, { prepaidAllowance });
}

export type BalanceEditFormInstance = ReturnType<typeof useBalanceEditForm>;
