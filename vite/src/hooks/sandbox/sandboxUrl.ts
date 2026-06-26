import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { getActiveSandbox } from "./useActiveSandbox";

export const SANDBOX_PREFIX = "/sandbox";

// Reserved because they're legacy /sandbox/<page> routes: a sandbox whose slug is
// one of these would have its URLs captured by the page route.
export const RESERVED_SANDBOX_SLUGS = new Set([
	"products",
	"customers",
	"features",
	"migrations",
	"dev",
	"analytics",
	"settings",
	"admin",
	"quickstart",
	"impersonate-redirect",
	"trmnl",
]);

export const sandboxSlug = (name: string) => slugify(name, "dash");

export const isReservedSandboxSlug = (name: string) =>
	RESERVED_SANDBOX_SLUGS.has(sandboxSlug(name));

export const validateSandboxName = (name: string): string | null => {
	const slug = sandboxSlug(name);
	if (!slug) {
		return "Name must include at least one letter or number";
	}
	if (RESERVED_SANDBOX_SLUGS.has(slug)) {
		return `"${name}" is a reserved name, pick another`;
	}
	return null;
};

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
	if (!pathname.startsWith(SANDBOX_PREFIX)) {
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
