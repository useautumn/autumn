import {
	CreateReferralProgramParamsSchema,
	CreateReferralProgramResponseSchema,
} from "./referralProgramsCreateOpModels.js";

export const referralProgramOps = {
	"/referral_programs.create": {
		post: {
			summary: "Create Referral Program",
			tags: ["referrals"],
			requestBody: {
				required: true,
				content: {
					"application/json": { schema: CreateReferralProgramParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "The created referral program.",
					content: {
						"application/json": { schema: CreateReferralProgramResponseSchema },
					},
				},
			},
		},
	},
};
