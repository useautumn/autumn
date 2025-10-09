// import type { Organization } from "@models/orgModels/orgTable.js";
// import { ApiVersionClass } from "./ApiVersionClass.js";
// import { legacyToSemVer, semVerToLegacy } from "./convertVersionUtils.js";

// /**
//  * DEPRECATED: Use ctx.apiVersion directly
//  * Middleware handles version resolution automatically
//  */
// export function getOrgApiVersion({
// 	org,
// 	reqApiVersion,
// }: {
// 	org: Organization;
// 	reqApiVersion?: ApiVersionClass;
// }): ApiVersionClass {
// 	if (reqApiVersion) {
// 		return reqApiVersion;
// 	}

// 	const legacyVersion = org.api_version || org.config?.api_version || 1.0;
// 	const semver = legacyToSemVer({ legacyVersion });

// 	if (!semver) {
// 		throw new Error(`Invalid version for org: ${legacyVersion}`);
// 	}

// 	return new ApiVersionClass(semver);
// }

// /**
//  * Convert ApiVersionClass → legacy float
//  * @example toLegacyVersion({ apiVersion: ctx.apiVersion }) // 1.1
//  */
// export function toLegacyVersion({
// 	apiVersion,
// }: {
// 	apiVersion: ApiVersionClass;
// }): number {
// 	const legacy = semVerToLegacy({ semver: apiVersion.value });
// 	return legacy || 1.0;
// }
