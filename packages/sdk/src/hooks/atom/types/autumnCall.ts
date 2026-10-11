import type { AutumnCore } from "../../../core.js";
import type { RequestOptions } from "../../../lib/sdks.js";
import type { Result } from "../../../types/fp.js";

/** A generated standalone function (`src/funcs/*`), such as `check`. */
export type AutumnCall<Request, Response, Failure> = (
	client: AutumnCore,
	request: Request,
	options?: RequestOptions,
) => PromiseLike<Result<Response, Failure>>;
