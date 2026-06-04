import type { DrizzleCli } from "@/db/initDrizzle.js";
import { oauthClientRepo } from "../repos/index.js";

const ATMN_OAUTH_CLIENT_NAMES = new Set(["atmn", "autumn cli"]);

const configuredAtmnClientIds = () =>
	new Set(
		(process.env.ATMN_OAUTH_CLIENT_IDS ?? "")
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean),
	);

const metadataMarksAtmn = (metadata: unknown) => {
	if (!metadata) return false;
	let metadataObject = metadata;
	if (typeof metadata === "string") {
		try {
			metadataObject = JSON.parse(metadata);
		} catch {
			return false;
		}
	}

	if (!metadataObject || typeof metadataObject !== "object") return false;

	const metadataRecord = metadataObject as Record<string, unknown>;
	return (
		metadataRecord.kind === "atmn" ||
		metadataRecord.client === "atmn" ||
		metadataRecord.clientType === "atmn" ||
		metadataRecord.client_type === "atmn" ||
		metadataRecord.source === "autumn-cli"
	);
};

export const isAtmnOAuthClientRecord = ({
	clientId,
	name,
	metadata,
}: {
	clientId: string | null | undefined;
	name: string | null | undefined;
	metadata?: unknown;
}) => {
	if (clientId && configuredAtmnClientIds().has(clientId)) return true;
	if (metadataMarksAtmn(metadata)) return true;

	const normalizedName = name?.trim().toLowerCase();
	return !!normalizedName && ATMN_OAUTH_CLIENT_NAMES.has(normalizedName);
};

export const isAtmnOAuthClientId = async ({
	db,
	clientId,
}: {
	db: DrizzleCli;
	clientId: string;
}) => {
	const client = await oauthClientRepo.getByClientId({ db, clientId });

	return isAtmnOAuthClientRecord(client ?? { clientId, name: null });
};
