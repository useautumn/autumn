/** What the server says about the key it was given: the org and the env it unlocks. */
export type OrgInfo = {
	id: string;
	name: string;
	slug: string;
	env: string;
	/** True when the key belongs to a sandbox sub-org rather than the main one. */
	is_sandbox?: boolean;
	/** The main organization's id, for a sandbox. */
	created_by?: string | null;
	/** `pending` while a keyless org has no owner; null for an ordinary org. */
	claim_state?: "pending" | "claimed" | "expiring" | null;
	/** When a pending claim window closes, ISO 8601. */
	claim_expires_at?: string | null;
	user?: { id: string; email: string; name: string };
};

export type FetchOrgInfo = () => Promise<OrgInfo>;
