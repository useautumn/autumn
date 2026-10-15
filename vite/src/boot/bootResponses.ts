// Shared by the inline boot script and the app, so it must stay free of imports.

export type BootResponse = {
	status: number;
	headers: Record<string, string>;
	body: string;
};

declare global {
	interface Window {
		__autumnBoot?: {
			startedAt: number;
			responses: Map<string, Promise<BootResponse | null>>;
		};
	}
}

/** Only requests made while the page is still loading are answered; later ones go to the network. */
const BOOT_RESPONSE_TTL_MS = 15_000;

/** Two requests share a boot response only if every input the server reads matches. */
export const bootRequestKey = ({
	method = "GET",
	url,
	body,
	env,
	sandboxOrgId,
	apiVersion,
}: {
	method?: string;
	url: string;
	body?: string | null;
	env?: string | null;
	sandboxOrgId?: string | null;
	apiVersion?: string | null;
}) =>
	[
		method.toUpperCase(),
		new URL(url, window.location.origin).href,
		body,
		env,
		sandboxOrgId,
		apiVersion,
	]
		.map((part) => part ?? "")
		.join("|");

/** Hands out a boot response once, so a later refetch always reaches the server. */
export const takeBootResponse = (key: string) => {
	const boot = window.__autumnBoot;
	if (!boot || Date.now() - boot.startedAt > BOOT_RESPONSE_TTL_MS) return;
	const response = boot.responses.get(key);
	boot.responses.delete(key);
	return response;
};

/** Boot responses belong to the session's org at page load; a switch makes them another org's data. */
export const discardBootResponses = () =>
	window.__autumnBoot?.responses.clear();
