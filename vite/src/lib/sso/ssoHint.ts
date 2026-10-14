import type { SsoOrgHint } from "@/lib/sso/ssoTypes";

const SSO_HINT_KEY = "autumn_sso_org_hint";

export const parseSsoHint = (raw: string | null): SsoOrgHint | null => {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<SsoOrgHint> | null;
		if (!parsed || typeof parsed !== "object") return null;
		const { providerId, organizationName, logo } = parsed;
		if (typeof providerId !== "string" || !providerId) return null;
		if (typeof organizationName !== "string" || !organizationName) return null;
		return {
			providerId,
			organizationName,
			logo: typeof logo === "string" && logo ? logo : null,
		};
	} catch {
		return null;
	}
};

export const getSsoHint = (): SsoOrgHint | null => {
	try {
		return parseSsoHint(localStorage.getItem(SSO_HINT_KEY));
	} catch {
		return null;
	}
};

export const setSsoHint = (hint: SsoOrgHint) => {
	try {
		localStorage.setItem(SSO_HINT_KEY, JSON.stringify(hint));
	} catch {}
};

export const clearSsoHint = () => {
	try {
		localStorage.removeItem(SSO_HINT_KEY);
	} catch {}
};
