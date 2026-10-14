import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import type { z } from "zod/v4";
import {
	type ApiCusFeatureV0,
	ApiCusFeatureV0Schema,
} from "../cusFeatures/previousVersions/apiCusFeatureV0";
import { ApiCustomerV0Schema } from "../previousVersions/apiCustomerV0";
import { ApiCustomerV1Schema } from "../previousVersions/apiCustomerV1";

export const V0_1_CustomerChange = defineVersionChange({
	name: "V0_1_CustomerChange",
	oldVersion: ApiVersion.V0_1,
	newVersion: ApiVersion.V0_2,
	description: [
		"Features: V1 format (with next_reset_at, allowance) → V0 format (minimal fields)",
	],

	affectedResources: [AffectedResource.Customer],
	oldSchema: ApiCustomerV0Schema,
	newSchema: ApiCustomerV1Schema,

	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof ApiCustomerV1Schema>;
	}) => {
		const v0_features: ApiCusFeatureV0[] = [];

		for (const feature of input.entitlements) {
			if (feature.unlimited) {
				const v0Feature = ApiCusFeatureV0Schema.parse({
					feature_id: feature.feature_id,
					unlimited: true,
					interval: null,
					balance: null,
					used: null,
				});
				v0_features.push(v0Feature);
				continue;
			}

			if (!feature.interval && !feature.balance && !feature.unlimited) {
				const v0Feature = ApiCusFeatureV0Schema.parse({
					feature_id: feature.feature_id,
					interval: null,
				});
				v0_features.push(v0Feature);
				continue;
			}

			const v0Feature = ApiCusFeatureV0Schema.parse({
				feature_id: feature.feature_id,
				unlimited: feature.unlimited || false,
				interval: feature.interval,
				balance: feature.balance,
				used: feature.used,
			});

			v0_features.push(v0Feature);
		}

		const products = input.products.map((p) => {
			const {
				current_period_start: _currentPeriodStart,
				current_period_end: _currentPeriodEnd,
				...rest
			} = p;
			return rest;
		});

		return {
			...input,
			customer: {
				...input.customer,
				name: input.customer.name || "",
				email: input.customer.email || "",
				fingerprint: input.customer.fingerprint || "",
			},
			entitlements: v0_features,
			products,
		} satisfies z.infer<typeof ApiCustomerV0Schema>;
	},
});
