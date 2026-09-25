import type { SecretKeyName } from "../../../env/resolveTarget";
import { isSandboxKeyName } from "../../../env/sandboxKeyName";
import { sandboxSlug } from "../../../generated/sandboxName";
import type { OrgInfo } from "../../env/types/orgInfo";
import type { RemoteWebhook } from "./types";

/** One env a pull reads webhooks from, through that env's own key. */
export type WebhookPullEnv = {
	keyName: SecretKeyName;
	/** How a skipped-env warning names it, before its key is known to work. */
	label: string;
	/** The `url` map key; a named sandbox's slug costs one lookup. */
	envKey: () => Promise<string>;
	listWebhooks: () => Promise<{ list: RemoteWebhook[] }>;
};

/**
 * Every env the loaded env files hold a key for. Live comes last, so when envs
 * disagree on shared fields like `events`, prod's value is the one written.
 */
export const webhookPullEnvs = ({
	env = process.env,
	listWebhooks,
	fetchOrgInfo,
}: {
	env?: Record<string, string | undefined>;
	listWebhooks: (args: {
		secretKey: string;
	}) => Promise<{ list: RemoteWebhook[] }>;
	fetchOrgInfo: (args: { secretKey: string }) => Promise<OrgInfo>;
}): WebhookPullEnv[] => {
	const named = Object.keys(env).filter(isSandboxKeyName).sort();
	const keyNames: SecretKeyName[] = [
		"AUTUMN_SECRET_KEY",
		...named,
		"AUTUMN_PROD_SECRET_KEY",
	];
	return keyNames.flatMap((keyName) => {
		const secretKey = env[keyName];
		if (!secretKey) return [];
		const envKey = async () => {
			if (keyName === "AUTUMN_SECRET_KEY") return "sandbox";
			if (keyName === "AUTUMN_PROD_SECRET_KEY") return "live";
			return sandboxSlug((await fetchOrgInfo({ secretKey })).name);
		};
		const label =
			keyName === "AUTUMN_SECRET_KEY"
				? "sandbox"
				: keyName === "AUTUMN_PROD_SECRET_KEY"
					? "live"
					: `sandbox ${keyName.slice("AUTUMN_SANDBOX_".length, -"_SECRET_KEY".length).toLowerCase()}`;
		return [
			{
				keyName,
				label,
				envKey,
				listWebhooks: () => listWebhooks({ secretKey }),
			},
		];
	});
};
