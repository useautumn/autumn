import type { AtomError } from "./atomErrorOf.js";

/** An answer in the API's shape the owner thread gave, thrown again on the thread that took the request. */
export class AtomApiError extends Error {
	readonly answer: AtomError;

	constructor({ answer }: { answer: AtomError }) {
		super(answer.message);
		this.name = "AtomApiError";
		this.answer = answer;
	}
}
