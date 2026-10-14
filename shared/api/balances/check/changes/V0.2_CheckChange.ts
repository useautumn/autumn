import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { FeatureType } from "../../../../models/featureModels/featureEnums.js";

import {
	type CheckLegacyData,
	CheckLegacyDataSchema,
} from "../checkLegacyData.js";
import {
	type CheckResponseV0,
	CheckResponseV0Schema,
} from "../prevVersions/CheckResponseV0.js";
import { CheckResponseV1Schema } from "../prevVersions/CheckResponseV1.js";

export const V0_2_CheckChange = defineVersionChange({
	name: "V0.2 Check Change",
	newVersion: ApiVersion.V1_1,
	oldVersion: ApiVersion.V0_2,
	description: [
		"Check response transformed to balances array format",
		"Single check result object → { allowed, balances: [...] }",
	],
	affectedResources: [AffectedResource.Check],
	newSchema: CheckResponseV1Schema,
	oldSchema: CheckResponseV0Schema,
	legacyDataSchema: CheckLegacyDataSchema,
	affectsResponse: true,

	transformResponse: ({
		input,
		legacyData,
	}: {
		input: z.infer<typeof CheckResponseV1Schema>;
		legacyData?: CheckLegacyData;
	}): CheckResponseV0 => {
		const {
			allowed,
			feature_id,
			required_balance,
			balance,
			unlimited,
			overage_allowed,
		} = input;

		if (!legacyData) {
			throw new Error("Legacy data is required");
		}

		const { noCusEnts, featureToUse } = legacyData;

		if (noCusEnts && !allowed) {
			return {
				allowed: false,
				balances: [],
			};
		}

		const balanceObj: CheckResponseV0["balances"][number] = {
			feature_id,
		};

		if (featureToUse.type === FeatureType.Boolean) {
			return {
				allowed,
				balances: [
					{
						feature_id,
						balance: null,
					},
				],
			};
		}

		if (
			balance === null &&
			!unlimited &&
			!overage_allowed &&
			required_balance === undefined
		) {
			balanceObj.balance = null;
			return {
				allowed,
				balances: [balanceObj],
			};
		}

		if (unlimited) {
			balanceObj.balance = null;
			balanceObj.unlimited = true;
			balanceObj.usage_allowed = overage_allowed || false;
			balanceObj.required = null;
			return {
				allowed,
				balances: [balanceObj],
			};
		}

		if (overage_allowed) {
			balanceObj.balance = balance;
			balanceObj.unlimited = false;
			balanceObj.usage_allowed = true;
			balanceObj.required = null;
			return {
				allowed,
				balances: [balanceObj],
			};
		}

		balanceObj.required = required_balance ?? null;
		balanceObj.balance = balance;

		return {
			allowed,
			balances: [balanceObj],
		};
	},
});
