import { DEFAULT_BASE_URL, type Target } from "../env/resolveTarget";
import { renderEnv } from "../render/renderEnv";
import type { FetchOrgInfo, OrgInfo } from "./env/types/orgInfo";
import type { WriteLine } from "./sandbox/types/sandboxClient";

export type EnvOptions = {
	/** Resolved by the CLI from its global flags: -p, --sandbox, -l all land here. */
	target: Target;
	fetchOrgInfo: FetchOrgInfo;
	json?: boolean;
	write?: WriteLine;
};

/** Report which org, env and key this directory's commands would act on. */
export const runEnv = async ({
	target,
	fetchOrgInfo,
	json = false,
	write = (text) => process.stdout.write(text),
}: EnvOptions): Promise<OrgInfo> => {
	const info = await fetchOrgInfo();

	if (json) {
		write(`${JSON.stringify(info, null, 2)}\n`);
		return info;
	}

	write(
		`${renderEnv({
			info,
			secretKeyName: target.secretKeyName,
			// The default is noise; a local or staging server is the surprise worth showing.
			...(target.baseUrl === undefined || target.baseUrl === DEFAULT_BASE_URL
				? {}
				: { baseUrl: target.baseUrl }),
			...(target.sandboxId === undefined
				? {}
				: { sandboxId: target.sandboxId }),
		})}\n`,
	);
	return info;
};
