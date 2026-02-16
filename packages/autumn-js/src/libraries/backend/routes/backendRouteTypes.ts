import type Autumn from "@sdk";
import type { AuthResult } from "../utils/AuthFunction";
import type { BackendResult } from "../utils/backendRes";

export type BackendRouteHandlerArgs = {
	autumn: Autumn;
	body: unknown;
	path: string;
	getCustomer: () => AuthResult;
	pathParams?: Record<string, string>;
	searchParams?: Record<string, string>;
};

export type BackendRouteHandler = (
	args: BackendRouteHandlerArgs,
) => Promise<BackendResult>;

