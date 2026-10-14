export function computeGrantedBalanceInput({
	newGPB,
	prepaidAllowance,
}: {
	newGPB: number;
	prepaidAllowance: number;
}): number {
	return newGPB - prepaidAllowance;
}
