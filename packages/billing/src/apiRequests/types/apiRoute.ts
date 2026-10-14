export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type ApiRoute = {
	method: HttpMethod;
	path: `/v1/${string}`;
};
