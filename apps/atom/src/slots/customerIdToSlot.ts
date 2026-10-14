export const customerIdToSlot = ({
	customerId,
	slotCount,
}: {
	customerId: string;
	slotCount: number;
}): number => Bun.hash.xxHash32(customerId) % slotCount;
