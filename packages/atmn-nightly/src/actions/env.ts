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

const isMainSandboxKey = ({ info }: { info: OrgInfo }): boolean =>
	info.is_sandbox !== true;

/** The same facts an agent reads from `--json`, plus what to do about them. */
export const envJson = ({
	info,
	target,
}: {
	info: OrgInfo;
	target: Target;
}) => {
	const isMaster = isMainSandboxKey({ info });
	const notes: string[] = [];
	// A pinned sandbox is meant to answer as itself; only the org's own key
	// answering as a sandbox is the mistake worth flagging.
	if (!isMaster && target.secretKeyName === "AUTUMN_SECRET_KEY")
		notes.push(
			`AUTUMN_SECRET_KEY belongs to sandbox "${info.name}" (${info.id}), not your main sandbox. Sandbox commands need the main key: run atmn login.`,
		);
	if (target.sandboxId !== undefined && target.sandboxId !== info.id)
		notes.push(
			`AUTUMN_SANDBOX_ID points at ${target.sandboxId} but the key answers as ${info.id}; run atmn sandbox use to repair the pin.`,
		);
	if (info.claim_state === "pending")
		notes.push(
			`This org has no owner yet${info.claim_expires_at ? ` (link it before ${info.claim_expires_at})` : ""}: atmn login --claim <email>.`,
		);
	if (target.sandboxId !== undefined)
		notes.push("`atmn sandbox use --clear` returns to the main sandbox.");
	else if (isMaster)
		notes.push(
			"`atmn sandbox use <name|id>` targets a named sandbox; `atmn sandbox list` shows them.",
		);
	return {
		organization: { id: info.id, name: info.name, slug: info.slug },
		env: info.env,
		isMaster,
		/** False while a keyless org waits to be linked; true for any owned org. */
		claimed: info.claim_state !== "pending",
		claimExpiresAt:
			info.claim_state === "pending" ? (info.claim_expires_at ?? null) : null,
		sandbox:
			target.sandboxId === undefined
				? null
				: { id: target.sandboxId, authenticatedAs: info.id },
		user: info.user ?? null,
		keyName: target.secretKeyName,
		baseUrl: target.baseUrl ?? DEFAULT_BASE_URL,
		notes,
	};
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
		write(`${JSON.stringify(envJson({ info, target }), null, 2)}\n`);
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
