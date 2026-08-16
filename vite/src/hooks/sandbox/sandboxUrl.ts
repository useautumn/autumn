import { RESERVED_SANDBOX_SLUGS, sandboxSlug } from "@autumn/shared";
import { getActiveSandbox } from "./useActiveSandbox";

export const SANDBOX_PREFIX = "/sandbox";

export const getSandboxSlugFromPath = (pathname: string): string | null => {
	if (!pathname.startsWith(`${SANDBOX_PREFIX}/`)) {
		return null;
	}
	const segment = pathname
		.slice(SANDBOX_PREFIX.length + 1)
		.split("/")[0]
		.toLowerCase();
	if (!segment || RESERVED_SANDBOX_SLUGS.has(segment)) {
		return null;
	}
	return segment;
};

export const sandboxBasePath = (): string => {
	const active = getActiveSandbox();
	return active
		? `${SANDBOX_PREFIX}/${sandboxSlug(active.name)}`
		: SANDBOX_PREFIX;
};

export const stripSandboxPrefix = (pathname: string): string => {
	if (
		pathname !== SANDBOX_PREFIX &&
		!pathname.startsWith(`${SANDBOX_PREFIX}/`)
	) {
		return pathname;
	}
	const slug = getSandboxSlugFromPath(pathname);
	const prefix = slug ? `${SANDBOX_PREFIX}/${slug}` : SANDBOX_PREFIX;
	const bare = pathname.slice(prefix.length);
	if (!bare) {
		return "/";
	}
	return bare.startsWith("/") ? bare : `/${bare}`;
};
