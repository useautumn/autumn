import { AppEnv } from "@autumn/shared";
import { AxiosError } from "axios";
import type { NavigateFunction } from "react-router-dom";
import { ZodError } from "zod/v3";

export const getOrgEnvFromPath = (pathname: string): { orgId: string | null; env: AppEnv } => {
  const parts = pathname.split("/").filter(Boolean);
  // URL pattern: /<org_id>/<env>/...
  if (parts.length >= 2 && (parts[1] === "live" || parts[1] === "sandbox")) {
    return {
      orgId: parts[0],
      env: parts[1] === "sandbox" ? AppEnv.Sandbox : AppEnv.Live,
    };
  }
  return { orgId: null, env: AppEnv.Live };
};

export const buildOrgEnvPath = ({
  orgId,
  env,
  path,
}: {
  orgId: string;
  env: AppEnv;
  path: string;
}) => {
  const envStr = env === AppEnv.Sandbox ? "sandbox" : "live";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `/${orgId}/${envStr}${cleanPath}`;
};

const compareStatus = (statusA: string, statusB: string) => {
	const statusOrder = ["scheduled", "active", "past_due", "expired"];
	return statusOrder.indexOf(statusA) - statusOrder.indexOf(statusB);
};

const invalidNumber = (value: unknown) => {
	return Number.isNaN(parseFloat(value as string));
};

export const getBackendErr = (
	error: AxiosError | ZodError | unknown,
	defaultText: string,
) => {
	if (error instanceof ZodError) {
		return error.errors.map((err) => err.message).join(", ");
	}
	if (error instanceof AxiosError && error.response?.data) {
		const data = error.response.data as { message: string; code: string };
		if (data.message && data.code) {
			return data.message;
		} else {
			return defaultText;
		}
	} else {
		return defaultText;
	}
};

const getBackendErrObj = (error: AxiosError) => {
	if (error.response?.data) {
		const data = error.response.data as { code: string; message: string };
		if (data.code) {
			return { code: data.code, message: data.message };
		}
	}
	return null;
};

export const getEnvFromPath = (path: string) => {
	const { env } = getOrgEnvFromPath(path);
	return env;
};

export const envToPath = (targetEnv: AppEnv, currentPath: string) => {
	const { orgId } = getOrgEnvFromPath(currentPath);
	if (!orgId) return null;

	const parts = currentPath.split("/").filter(Boolean);
	// parts[0] = org_id, parts[1] = env, parts[2+] = page path
	const pageParts = parts.slice(2);
	const pagePath = pageParts.join("/");

	// Check if we're on a customer detail page → redirect to list
	if (pagePath.startsWith("customers/")) {
		return buildOrgEnvPath({ orgId, env: targetEnv, path: "/customers" });
	}
	// Check if we're on a product detail page → redirect to list
	if (pagePath.startsWith("products/")) {
		return buildOrgEnvPath({ orgId, env: targetEnv, path: "/products" });
	}

	return buildOrgEnvPath({ orgId, env: targetEnv, path: `/${pagePath}` });
};

export const navigateTo = (
	path: string,
	navigate: NavigateFunction,
	env?: AppEnv,
) => {
	const curPath = window.location.pathname;
	const { orgId, env: curEnv } = getOrgEnvFromPath(curPath);

	path = path.replace("@", "%40");

	if (orgId) {
		const targetEnv = env ?? curEnv;
		navigate(buildOrgEnvPath({ orgId, env: targetEnv, path }));
	} else {
		navigate(path);
	}
};

export const pushPage = ({
	path,
	queryParams,
	navigate,
	preserveParams = true,
	debug = false,
}: {
	path: string;
	queryParams?: Record<string, string | undefined>;
	navigate?: NavigateFunction;
	preserveParams?: boolean;
	debug?: boolean;
}) => {
	const pathname = window.location.pathname;
	const { orgId, env } = getOrgEnvFromPath(pathname);

	// Start fresh or with current params based on whether new params are provided
	let curQueryParams: URLSearchParams;

	if (queryParams) {
		// When queryParams are provided, start fresh (replace mode)
		curQueryParams = new URLSearchParams();
		for (const [key, value] of Object.entries(queryParams)) {
			if (value) {
				curQueryParams.set(key, value);
			}
		}
	} else if (preserveParams) {
		// No new params provided, preserve existing if requested
		curQueryParams = new URLSearchParams(window.location.search);
	} else {
		// No new params and don't preserve - empty params
		curQueryParams = new URLSearchParams();
	}

	path = path.replace("@", "%40");

	if (curQueryParams.toString()) {
		path = `${path}?${curQueryParams.toString()}`;
	}

	// Prepend org_id/env prefix
	if (orgId) {
		const envStr = env === AppEnv.Sandbox ? "sandbox" : "live";
		// path might already have query params, so split carefully
		const [pathPart, queryPart] = path.split("?");
		const prefixedPath = `/${orgId}/${envStr}${pathPart}`;
		path = queryPart ? `${prefixedPath}?${queryPart}` : prefixedPath;
	}

	if (navigate) {
		navigate(path);
	}

	return path;
};

export const getRedirectUrl = (path: string, env: AppEnv) => {
	const curPath = window.location.pathname;
	const { orgId } = getOrgEnvFromPath(curPath);

	path = path.replace("@", "%40");

	if (orgId) {
		return buildOrgEnvPath({ orgId, env, path });
	}

	// Fallback for pages outside org context
	if (env === AppEnv.Sandbox) {
		return `/sandbox${path}`;
	}
	return path;
};

export const notNullish = (value: unknown) => {
	return value !== null && value !== undefined;
};

export const nullish = (value: unknown) => {
	return value === null || value === undefined;
};

const parseNumberInput = ({
	value,
	fallback = 0,
}: {
	value?: string;
	fallback?: number;
}): number | null => {
	if (value === undefined) return fallback;

	const numValue = Number.parseFloat(value);
	return Number.isNaN(numValue) ? fallback : numValue;
};

const getMetaKey = () => {
	if (navigator.userAgent.includes("Mac")) {
		return "⌘";
	}
	return "Ctrl";
};
/**
 * Throws an error with backend message if available, otherwise rethrows original error
 */
export const throwBackendError = (error: any): never => {
	if (error?.response?.data?.message) {
		throw new Error(error.response.data.message);
	}
	throw error;
};

/** Opens a URL in a new tab without being blocked by popup blockers */
export const openInNewTab = ({ url }: { url: string }) => {
	const a = document.createElement("a");
	a.href = url;
	a.target = "_blank";
	a.rel = "noopener noreferrer";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
};
