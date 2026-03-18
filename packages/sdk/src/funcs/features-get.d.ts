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
 * Retrieves a single feature by its ID.
 *
 * Use this when you need to fetch the details of a specific feature.
 *
 * @example
 * ```typescript
 * // Get a feature by ID
 * const response = await client.features.get({ featureId: "api-calls" });
 * ```
 *
 * @param featureId - The ID of the feature.
 *
 * @returns The feature object with its full configuration.
 */
export declare function featuresGet(client: AutumnCore, request: models.GetFeatureParams, options?: RequestOptions): APIPromise<Result<models.GetFeatureResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
