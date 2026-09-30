/**
 * The slot a customer lives in: decided by its id alone, so it never moves while the slot count stands.
 * An entity lives in its customer's slot.
 */
export const customerIdToSlot = ({
	customerId,
	slotCount,
}: {
	customerId: string;
	slotCount: number;
}): number => Bun.hash.xxHash32(customerId) % slotCount;
