/** Either key can be absent when the org's OAuth client is bound to one env. */
export type OrgApiKeys = {
	sandboxKey?: string;
	prodKey?: string;
	orgId?: string;
};
