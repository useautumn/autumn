import { AppEnv } from "@autumn/shared";
import { AxiosError } from "axios";
import type { NavigateFunction } from "react-router-dom";
import { ZodError } from "zod/v3";
import {
	sandboxBasePath,
	stripSandboxPrefix,
} from "@/hooks/sandbox/sandboxUrl";
import { readDismissed } from "@/views/onboarding/hooks/onboardingSnapshot";

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
	if (path === "/sandbox" || path.startsWith("/sandbox/")) {
		return AppEnv.Sandbox;
	}
	return AppEnv.Live;
};

export const getDefaultOrgPath = (
	org?: { deployed?: boolean } | null,
	path = "/products?tab=products",
) => {
	if (org?.deployed) return path;
	return readDismissed() ? `/sandbox${path}` : "/sandbox/onboarding";
};

export const getSafeNextPath = (searchParams: URLSearchParams) => {
	const next = searchParams.get("next");
	return isSafeLocalPath(next) ? next : "/";
};

export const isSafeLocalPath = (path?: string | null): path is string =>
	!!path && path.startsWith("/") && !path.startsWith("//") && path[1] !== "\\";

const appendSearch = (path: string, search: string) => {
	const query = search.replace(/^\?/, "");
	if (!query) return path;
	return `${path}${path.includes("?") ? "&" : "?"}${query}`;
};

export const getOrgRouteRedirect = ({
	pathname,
	search = "",
	deployed,
}: {
	pathname: string;
	search?: string;
	deployed: boolean;
}) => {
	if (pathname === "/") {
		return appendSearch(getDefaultOrgPath({ deployed }), search);
	}

	if (!deployed && !pathname.startsWith("/sandbox")) {
		return `/sandbox${pathname}${search}`;
	}

	return null;
};

export const envToPath = (env: AppEnv, currentPath: string) => {
	let bare = stripSandboxPrefix(currentPath);
	if (/^\/(customers|products|migrations)\/[^/]+/.test(bare)) {
		bare = `/${bare.split("/")[1]}`;
	}
	return env === AppEnv.Sandbox ? `${sandboxBasePath()}${bare}` : bare;
};

export const navigateTo = (
	path: string,
	navigate: NavigateFunction,
	env?: AppEnv,
) => {
	const curPath = window.location.pathname;
	const curEnv = getEnvFromPath(curPath);

	path = path.replace("@", "%40");
	if (curEnv === AppEnv.Sandbox) {
		navigate(`${sandboxBasePath()}${path}`);
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
	const curEnv = getEnvFromPath(pathname);

	let curQueryParams: URLSearchParams;

	if (queryParams) {
		curQueryParams = new URLSearchParams();
		for (const [key, value] of Object.entries(queryParams)) {
			if (value) {
				curQueryParams.set(key, value);
			}
		}
	} else if (preserveParams) {
		curQueryParams = new URLSearchParams(window.location.search);
	} else {
		curQueryParams = new URLSearchParams();
	}

	path = path.replace("@", "%40");

	if (curQueryParams.toString()) {
		path = `${path}?${curQueryParams.toString()}`;
	}

	if (curEnv === AppEnv.Sandbox) {
		path = `${sandboxBasePath()}${path}`;
	}

	if (navigate) {
		navigate(path);
	}

	return path;
};

export const getRedirectUrl = (path: string, env: AppEnv) => {
	path = path.replace("@", "%40");
	if (env === AppEnv.Sandbox) {
		return `${sandboxBasePath()}${path}`;
	} else {
		return path;
	}
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

export const throwBackendError = (error: any): never => {
	if (error?.response?.data?.message) {
		throw new Error(error.response.data.message);
	}
	throw error;
};

export const openInNewTab = ({ url }: { url: string }) => {
	const a = document.createElement("a");
	a.href = url;
	a.target = "_blank";
	a.rel = "noopener noreferrer";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
};
