/**
 * Computes the granted_balance value to send to the balance update API
 * when the BalanceEditSheet "set" mode submits.
 *
 * The form displays grantedAndPurchasedBalance (GPB) as an editable field.
 * To derive the actual granted_balance, we subtract the prepaid allowance
 * from the user's new GPB value.
 */
export function computeGrantedBalanceInput({
	newGPB,
	prepaidAllowance,
}: {
	newGPB: number;
	prepaidAllowance: number;
}): number {
	return newGPB - prepaidAllowance;
}
