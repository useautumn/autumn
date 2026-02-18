import { ErrCode } from "@shared/enums/ErrCode.js";
import { RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

const createUnsupportedTransferError = () =>
	new RecaseError({
		message:
			"Resource transfers are disabled for this integration. Contact support if this is needed.",
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.FORBIDDEN,
	});

export const handleCreateResourceTransfer = createRoute({
	handler: async () => {
		throw createUnsupportedTransferError();
	},
});

export const handleVerifyResourceTransfer = createRoute({
	handler: async () => {
		throw createUnsupportedTransferError();
	},
});

export const handleAcceptResourceTransfer = createRoute({
	handler: async () => {
		throw createUnsupportedTransferError();
	},
});
