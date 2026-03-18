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
 * Delete a plan
 *
 * @remarks
 * Deletes a plan by its ID.
 *
 * Use this to permanently remove a plan. Plans with active customers cannot be deleted - archive them instead.
 *
 * @example
 * ```typescript
 * // Delete a plan
 * const response = await client.plans.delete({ planId: "unused_plan" });
 * ```
 *
 * @example
 * ```typescript
 * // Delete all versions of a plan
 * const response = await client.plans.delete({ planId: "legacy_plan", allVersions: true });
 * ```
 *
 * @param planId - The ID of the plan to delete.
 * @param allVersions - If true, deletes all versions of the plan. Otherwise, only deletes the latest version. (optional)
 *
 * @returns A success flag indicating the plan was deleted.
 */
export declare function plansDelete(client: AutumnCore, request: models.DeletePlanParams, options?: RequestOptions): APIPromise<Result<models.DeletePlanResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
