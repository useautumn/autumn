export type CapyState = {
	machineId: string;
	branchName?: string;
	branchId?: string;
	databaseUrl?: string;
	createdAt: number;
	secrets?: {
		betterAuthSecret: string;
		encryptionIv: string;
		encryptionPassword: string;
	};
};

export function deriveBranchName(machineId: string): string {
	const normalized = machineId.toLowerCase();
	if (!/^[0-9a-hjkmnp-tv-z]{26}$/.test(normalized)) {
		throw new Error("Capy machine bindingId is not a ULID");
	}
	return `capy-${normalized}`;
}

export function stateForMachine(
	state: CapyState | null,
	machineId: string,
): CapyState | null {
	return state?.machineId === machineId ? state : null;
}
