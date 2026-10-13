import { deleteApiKey } from "./deleteApiKey.js";
import { deleteApiKeysByOrg } from "./deleteApiKeysByOrg.js";
import { getApiKeyVerificationData } from "./getApiKeyVerificationData.js";
import { insertApiKey } from "./insertApiKey.js";
import { listApiKeyHashes } from "./listApiKeyHashes.js";
import { listApiKeysByOrg } from "./listApiKeysByOrg.js";

export const apiKeyRepo = {
	getVerificationData: getApiKeyVerificationData,
	listByOrg: listApiKeysByOrg,
	listHashes: listApiKeyHashes,
	insert: insertApiKey,
	delete: deleteApiKey,
	deleteByOrg: deleteApiKeysByOrg,
};
