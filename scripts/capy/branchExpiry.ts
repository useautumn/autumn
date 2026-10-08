export const CAPY_BRANCH_TTL_DAYS = 14;

// Fixed from creation, never extended on wake, so idle capy branches self-delete.
export function capyBranchExpiresAt({
	createdAt,
}: {
	createdAt: number;
}): string {
	return new Date(
		createdAt + CAPY_BRANCH_TTL_DAYS * 24 * 60 * 60 * 1000,
	).toISOString();
}
