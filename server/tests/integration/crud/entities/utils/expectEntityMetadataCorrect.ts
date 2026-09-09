import { expect } from "bun:test";
import type { ApiEntityV2 } from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

export const expectEntityMetadataCorrect = ({
	entity,
	metadata,
}: {
	entity: Pick<ApiEntityV2, "metadata">;
	metadata: Record<string, unknown>;
}) => {
	expect(entity.metadata).toEqual(metadata);
};

export const expectFetchedEntityMetadataCorrect = async ({
	autumn,
	customerId,
	entityId,
	metadata,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId: string;
	metadata: Record<string, unknown>;
}) => {
	const entity = await autumn.entities.get<ApiEntityV2>(customerId, entityId, {
		skip_cache: "true",
	});
	expectEntityMetadataCorrect({ entity, metadata });
	return entity;
};
