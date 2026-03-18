import { AutumnCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { AutumnError } from "../models/autumn-error.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/http-client-errors.js";
import * as models from "../models/index.js";
import { ResponseValidationError } from "../models/response-validation-error.js";
import { SDKValidationError } from "../models/sdk-validation-error.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Deletes a feature by its ID.
 *
 * Use this to permanently remove a feature. Note: features that are used in products cannot be deleted - archive them instead.
 *
 * @example
 * ```typescript
 * // Delete an unused feature
 * const response = await client.features.delete({ featureId: "old-feature" });
 * ```
 *
 * @param featureId - The ID of the feature to delete.
 *
 * @returns A success flag indicating the feature was deleted.
 */
export declare function featuresDelete(client: AutumnCore, request: models.DeleteFeatureParams, options?: RequestOptions): APIPromise<Result<models.DeleteFeatureResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
