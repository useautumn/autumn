import { ErrCode, InternalError, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { EntityService } from "@/internal/api/entities/EntityService";

export const findCustomerForEntity = async ({
	ctx,
	entityId,
}: {
	ctx: AutumnContext;
	entityId: string;
}) => {
	const entities = await EntityService.listById({
		ctx,
		id: entityId,
		withCustomer: true,
	});

	if (entities.length > 1) {
		throw new RecaseError({
			message: `Two entities with the ID ${entityId} found`,
			code: ErrCode.EntityIdRequired,
			statusCode: 400,
		});
	}

	if (!entities[0].customer) {
		throw new InternalError({
			message: `[findCustomerForEntity] entities[0].customer doesn't exist`,
		});
	}

	return entities[0].customer;
};
