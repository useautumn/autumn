import { check } from "../../funcs/check.js";
import { ClientSDK, type RequestOptions } from "../../lib/sdks.js";
import type * as models from "../../models/index.js";
import { unwrapAsync } from "../../types/fp.js";
import { askAtom } from "./askAtom.js";

const isCheckWrite = (request: models.CheckParams): boolean =>
	request.sendEvent === true || request.lock !== undefined;

/** `autumn.atom`: the calls Atom serves, made on the same client and options, answered by Atom while it is up. */
export class Atom extends ClientSDK {
	/** Same params and response as `autumn.check`. */
	async check(
		request: models.CheckParams,
		options?: RequestOptions,
	): Promise<models.CheckResponse> {
		return unwrapAsync(
			askAtom({
				client: this,
				call: check,
				request,
				options,
				writes: isCheckWrite(request),
			}),
		);
	}
}
