import { RecaseError } from "../base/RecaseError.js";
import { EntityErrorCode } from "../codes/entityErrCodes.js";

export class EntityNotFoundError extends RecaseError {
	constructor(opts: { entityId: string }) {
		super({
			message: `Entity ${opts.entityId} not found`,
			code: EntityErrorCode.EntityNotFound,
			statusCode: 404,
		});
		this.name = "EntityNotFoundError";
	}
}
