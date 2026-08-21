export class OAuthHttpError extends Error {
	name = "OAuthHttpError";
	readonly status: number;
	/** Absent for a request that presented no credentials — RFC 6750 §3.1. */
	readonly error?: string;
	readonly wwwAuthenticate?: string;

	constructor({
		error,
		message,
		status,
		wwwAuthenticate,
	}: {
		error?: string;
		message: string;
		status: number;
		wwwAuthenticate?: string;
	}) {
		super(message);
		this.status = status;
		this.error = error;
		this.wwwAuthenticate = wwwAuthenticate;
	}
}
