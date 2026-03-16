/**
 * In-place config update module
 *
 * Uses line-based parsing to update autumn.config.ts while preserving:
 * - Comments (inline and block)
 * - Order of declarations
 * - Custom variable names
 */

export { type ParsedEntity, parseExistingConfig } from "./parseConfig.js";
export { type UpdateResult, updateConfigInPlace } from "./updateConfig.js";
