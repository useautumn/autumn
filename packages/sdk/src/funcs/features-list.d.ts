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
 * Lists all features in the current environment.
 *
 * Use this to retrieve all features configured for your organization to display in dashboards or for feature management.
 *
 * @returns A list of all features with their configuration and metadata.
 */
export declare function featuresList(client: AutumnCore, _request?: models.ListFeaturesRequest | undefined, options?: RequestOptions): APIPromise<Result<models.ListFeaturesResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
