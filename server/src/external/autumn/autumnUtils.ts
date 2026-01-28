import { AppEnv, ErrCode, type Organization } from "@autumn/shared";
import { Autumn } from "autumn-js";
// import { Autumn } from "./autumnCli.js";
import RecaseError from "@/utils/errorUtils.js";

export enum FeatureId {
	Products = "products",
	Revenue = "revenue",
}

export const sendProductEvent = async ({
	org,
	env,
	incrementBy,
}: {
	org: Organization;
	env: AppEnv;
	incrementBy: number;
}) => {
	if (env !== AppEnv.Live) {
		return;
	}

	try {
		const autumn = new Autumn();

		await autumn.track({
			customer_id: org.id,
			event_name: "product",
			value: incrementBy,
			customer_data: {
				name: org.slug,
			},
		});
		console.log("sent product event", incrementBy);
	} catch (error: any) {
		console.log("Failed to send product event", error?.message || error);
	}
};

export const isEntitled = async ({
	org,
	env,
	featureId,
}: {
	org: Organization;
	env: AppEnv;
	featureId: FeatureId;
}) => {
	if (env !== AppEnv.Live) {
		return true;
	}

	const autumn = new Autumn();

	console.log("Checking entitlement for", org.id, featureId);

	const { data, error } = await autumn.check({
		customer_id: org.id,
		feature_id: featureId,
		customer_data: {
			name: org.slug,
		},
	});

	if (error) {
		throw new RecaseError({
			message: "Failed to check entitlement...",
			code: ErrCode.InternalError,
		});
	}

	if (data?.allowed) {
		return true;
	}

	let errText = `You've used up your allowance for ${featureId}.`;
	if (featureId === FeatureId.Revenue) {
		errText = `Looks like you've hit your monthly revenue limit for our plan, congrats 😉.`;
	}

	throw new RecaseError({
		message: `${errText} Please upgrade your plan or contact hey@useautumn.com to get more!`,
		code: ErrCode.InternalError,
		data: data,
	});
};
