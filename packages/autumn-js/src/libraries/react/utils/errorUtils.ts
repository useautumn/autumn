export interface ClientErrorResponse {
	message: string;
	code: string;
}

export class AutumnClientError extends Error {
	code: string;

	constructor(public error: ClientErrorResponse) {
		super(error.message);
		this.code = error.code;
	}

	toString() {
		return `${this.message} (${this.code})`;
	}

	toJSON() {
		return { message: this.message, code: this.code };
	}
}

export const toClientError = (
	error: any,
): {
	data: null;
	error: AutumnClientError;
} => {
	let msg = "Unknown error";
	let code = "unknown";

	if (error?.message) {
		msg = error.message;
	}

	if (error?.code) {
		code = error.code;
	}

	return {
		data: null,
		error: new AutumnClientError({ message: msg, code }),
	};
};
