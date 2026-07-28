import { deleteApiKey } from "./deleteApiKey.js";
import { getApiKeyVerificationData } from "./getApiKeyVerificationData.js";
import { insertApiKey } from "./insertApiKey.js";
import { listApiKeysByOrg } from "./listApiKeysByOrg.js";

export const apiKeyRepo = {
	getVerificationData: getApiKeyVerificationData,
	listByOrg: listApiKeysByOrg,
	insert: insertApiKey,
	delete: deleteApiKey,
};
