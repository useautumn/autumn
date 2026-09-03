/**
 * The one per-concept registration the spec cannot express: how a server row
 * (catalogV2.get, already recased to camelCase) becomes a fixture builder call.
 * Everything else about a collection is read from the OpenAPI document.
 *
 * `responseIdField` exists because catalogV2.get names a feature `id` while the
 * fixture calls it `featureId`.
 */
export const COLLECTIONS = {
	features: {
		builder: "feature",
		typeName: "Feature",
		idField: "featureId",
		responseIdField: "id",
	},
} as const;
