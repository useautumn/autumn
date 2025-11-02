import { AppEnv } from "@autumn/shared";
import { AxiosError } from "axios";
import type { NavigateFunction } from "react-router-dom";
import { ZodError } from "zod/v3";

export const compareStatus = (statusA: string, statusB: string) => {
	const statusOrder = ["scheduled", "active", "past_due", "expired"];
	return statusOrder.indexOf(statusA) - statusOrder.indexOf(statusB);
};

export const invalidNumber = (value: unknown) => {
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

export const getBackendErrObj = (error: AxiosError) => {
	if (error.response?.data) {
		const data = error.response.data as { code: string; message: string };
		if (data.code) {
			return { code: data.code, message: data.message };
		}
	}
	return null;
};

export const getEnvFromPath = (path: string) => {
	if (path.includes("/sandbox")) {
		return AppEnv.Sandbox;
	}
	return AppEnv.Live;
};

export const envToPath = (env: AppEnv, currentPath: string) => {
	// Check if we're on a customer detail page
	const customerDetailPattern = /^(\/sandbox)?\/customers\/[^/]+/;
	const isCustomerDetailPage = customerDetailPattern.test(currentPath);

	if (isCustomerDetailPage) {
		// Redirect to customers list instead of trying to preserve customer ID
		return env === AppEnv.Sandbox ? "/sandbox/customers" : "/customers";
	}

	if (env === AppEnv.Sandbox && !currentPath.includes("/sandbox")) {
		return `/sandbox${currentPath}`;
	} else if (env === AppEnv.Live && currentPath.includes("/sandbox")) {
		return currentPath.replace("/sandbox", "");
	}

	return null;
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
		navigate(`/sandbox${path}`);
	} else {
		navigate(path);
	}
};

export const pushPage = ({
	path,
	queryParams,
	navigate,
	preserveParams = true,
}: {
	path: string;
	queryParams?: Record<string, string | undefined>;
	navigate?: NavigateFunction;
	preserveParams?: boolean;
}) => {
	const pathname = window.location.pathname;
	const curEnv = getEnvFromPath(pathname);

	const curQueryParams = new URLSearchParams(window.location.search);
	if (!preserveParams) {
		curQueryParams.forEach((value, key) => {
			curQueryParams.delete(key);
		});
	}

	if (queryParams) {
		for (const [key, value] of Object.entries(queryParams)) {
			if (value) {
				curQueryParams.set(key, value);
			}
		}
	}

	path = path.replace("@", "%40");

	if (curQueryParams.toString()) {
		path = `${path}?${curQueryParams.toString()}`;
	}

	if (curEnv === AppEnv.Sandbox) {
		path = `/sandbox${path}`;
	}

	if (navigate) {
		navigate(path);
	}

	return path;
};

export const getRedirectUrl = (path: string, env: AppEnv) => {
	// Replace @ with %40
	path = path.replace("@", "%40");
	if (env === AppEnv.Sandbox) {
		return `/sandbox${path}`;
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

export const parseNumberInput = ({
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

export const getMetaKey = () => {
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
