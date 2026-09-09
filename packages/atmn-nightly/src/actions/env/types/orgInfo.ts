/** What the server says about the key it was given: the org and the env it unlocks. */
export type OrgInfo = {
	id: string;
	name: string;
	slug: string;
	env: string;
	user?: { id: string; email: string; name: string };
};

export type FetchOrgInfo = () => Promise<OrgInfo>;
