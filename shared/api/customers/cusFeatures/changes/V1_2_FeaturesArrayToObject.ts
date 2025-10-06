import { ApiCusFeatureSchema } from "@api/customers/cusFeatures/apiCusFeature.js";
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	VersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { z } from "zod/v4";

/**
 * V1_2: Features changed from array to object
 *
 * V1_2+ format: Object keyed by feature_id
 * V1_1 format: Array of features
 */

// V1_2+ features schema (object format)
const V1_2_FeaturesSchema = z.record(z.string(), ApiCusFeatureSchema);

// V1_1 features schema (array format)
const V1_1_FeaturesSchema = z.array(ApiCusFeatureSchema);

export class V1_2_FeaturesArrayToObject extends VersionChange<
	typeof V1_2_FeaturesSchema,
	typeof V1_1_FeaturesSchema
> {
	readonly version = ApiVersion.V1_2;
	readonly description = "Features: object → array";
	readonly affectedResources = [AffectedResource.CusFeature];
	readonly affectsRequest = false;
	readonly affectsResponse = true;

	readonly newSchema = V1_2_FeaturesSchema;
	readonly oldSchema = V1_1_FeaturesSchema;

	// Response: V1_2 object → V1_1 array
	transformResponse({
		input,
	}: {
		input: z.infer<typeof V1_2_FeaturesSchema>;
	}): z.infer<typeof V1_1_FeaturesSchema> {
		// Convert object to array
		return Object.values(input);
	}
}
