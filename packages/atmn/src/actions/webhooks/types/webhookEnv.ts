/** The environment a push or pull addresses, as the webhook lane needs it. */
export type WebhookEnv = {
	/** The `url` map key: `live`, `sandbox`, or the targeted sandbox's slug. */
	key: string;
	/** Prod secrets go to `.env.prod` without an org suffix. */
	live: boolean;
	/** The target org's id, looked up only when a secret needs naming. */
	orgId: () => Promise<string>;
};
