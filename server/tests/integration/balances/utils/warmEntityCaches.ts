import type { AutumnInt } from "@/external/autumn/autumnCli.js";

export const warmEntityCaches = async ({
	autumn,
	customerId,
	entities,
}: {
	autumn: AutumnInt;
	customerId: string;
	entities: { id: string }[];
}): Promise<void> => {
	await autumn.customers.get(customerId);
	for (const entity of entities) {
		await autumn.entities.get(customerId, entity.id);
	}
};
