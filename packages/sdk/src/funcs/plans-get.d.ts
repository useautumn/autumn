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
 * Get a plan
 *
 * @remarks
 * Retrieves a single plan by its ID.
 *
 * Use this to fetch the full configuration of a specific plan, including its features and pricing.
 *
 * @example
 * ```typescript
 * // Get a plan by ID
 * const response = await client.plans.get({ planId: "pro_plan" });
 * ```
 *
 * @example
 * ```typescript
 * // Get a specific version of a plan
 * const response = await client.plans.get({ planId: "pro_plan", version: 2 });
 * ```
 *
 * @param planId - The ID of the plan to retrieve.
 * @param version - The version of the plan to get. Defaults to the latest version. (optional)
 *
 * @returns The plan object with its full configuration.
 */
export declare function plansGet(client: AutumnCore, request: models.GetPlanParams, options?: RequestOptions): APIPromise<Result<models.GetPlanResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
