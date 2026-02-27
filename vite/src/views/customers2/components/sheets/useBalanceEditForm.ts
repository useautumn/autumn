import {
	type AutoTopup,
	BillingInterval,
	cusEntsToBalance,
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
	type FullCustomerEntitlement,
	nullish,
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
	selectedCusEnt: FullCustomerEntitlement;
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
		withRollovers: true,
	});

	const grantedBalance = cusEntsToGrantedBalance({
		cusEnts: [selectedCusEnt],
		entityId: entityId ?? undefined,
	});

	const grantedAndPurchasedBalance = grantedBalance + prepaidAllowance;

	return useAppForm({
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
					existingAutoTopUp?.purchase_limit?.interval ?? BillingInterval.Month,
				maxPurchases: existingAutoTopUp?.purchase_limit?.limit ?? null,
			},
		} as BalanceEditForm,
		validators: {
			onChange: BalanceEditFormSchema,
		},
	});
}

export type BalanceEditFormInstance = ReturnType<typeof useBalanceEditForm>;
