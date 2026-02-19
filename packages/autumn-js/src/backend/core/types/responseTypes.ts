/** Error body returned by backend routes */
export type BackendErrorBody = {
	message: string;
	code: string;
	statusCode: number;
	details?: unknown;
};

/** Result returned by route handlers */
export type BackendResult<T = unknown> = {
	statusCode: number;
	body: T | BackendErrorBody | null;
};
