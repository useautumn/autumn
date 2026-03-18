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
 * Updates an existing feature.
 *
 * Use this to modify feature properties like name, display settings, or to archive a feature.
 *
 * @example
 * ```typescript
 * // Update a feature's display name
 * const response = await client.features.update({ featureId: "api-calls", name: "API Requests", display: {"singular":"API request","plural":"API requests"} });
 * ```
 *
 * @example
 * ```typescript
 * // Archive a feature
 * const response = await client.features.update({ featureId: "deprecated-feature", archived: true });
 * ```
 *
 * @param name - The name of the feature. (optional)
 * @param type - The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system. (optional)
 * @param consumable - Whether this feature is consumable. A consumable feature is one that periodically resets and is consumed rather than allocated (like credits, API requests, etc.). Applicable only for 'metered' features. (optional)
 * @param display - Singular and plural display names for the feature in your user interface. (optional)
 * @param creditSchema - A schema that maps 'single_use' feature IDs to credit costs. Applicable only for 'credit_system' features. (optional)
 * @param archived - Whether the feature is archived. Archived features are hidden from the dashboard. (optional)
 * @param featureId - The ID of the feature to update.
 * @param newFeatureId - The new ID of the feature. Feature ID can only be updated if it's not being used by any customers. (optional)
 *
 * @returns The updated feature object.
 */
export declare function featuresUpdate(client: AutumnCore, request: models.UpdateFeatureParams, options?: RequestOptions): APIPromise<Result<models.UpdateFeatureResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
