import {
	cusEntsToBalance,
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
	type FullCusEntWithFullCusProduct,
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
}: {
	selectedCusEnt: FullCusEntWithFullCusProduct;
	entityId: string | null;
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
		} as BalanceEditForm,
		validators: {
			onChange: BalanceEditFormSchema,
		},
	});

	return Object.assign(form, { prepaidAllowance });
}

export type BalanceEditFormInstance = ReturnType<typeof useBalanceEditForm>;
