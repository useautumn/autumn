import { AutumnApiError } from "../../generated/client";
import type { OrgInfo } from "./types/orgInfo";

const ORG_INFO_PATH = "/v1/organization/me";

/** Not in the spec, so hand-written like the key-minting call rather than generated. */
export const fetchOrgInfo = async ({
	baseUrl,
	secretKey,
	fetch = globalThis.fetch,
}: {
	baseUrl: string;
	secretKey: string;
	fetch?: typeof globalThis.fetch;
}): Promise<OrgInfo> => {
	const response = await fetch(`${baseUrl}${ORG_INFO_PATH}`, {
		method: "GET",
		headers: { authorization: `Bearer ${secretKey}` },
	});

	const text = await response.text();
	const body: unknown = text ? JSON.parse(text) : null;
	if (!response.ok) {
		throw new AutumnApiError({
			status: response.status,
			body,
			path: ORG_INFO_PATH,
		});
	}
	return body as OrgInfo;
};
