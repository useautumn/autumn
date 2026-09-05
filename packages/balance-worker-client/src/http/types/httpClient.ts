export type HttpRequest = {
	url: string;
	body: unknown;
	signal: AbortSignal;
};
export type HttpResponse = { status: number; body: unknown };
export type HttpClient = {
	postJson(request: HttpRequest): Promise<HttpResponse>;
};
export type HttpClientConfig = { maxResponseBytes: number };

export class HttpResponseError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "HttpResponseError";
	}
}
