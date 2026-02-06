import { AppEnv } from "../../index.js";
import { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import type { Organization } from "../../models/orgModels/orgTable.js";

export const orgToInStatuses = ({ org }: { org: Organization }) => {
	if (org.config.include_past_due) {
		return [CusProductStatus.Active, CusProductStatus.PastDue];
	}
	return [CusProductStatus.Active];
};

export const orgToCurrency = ({ org }: { org: Organization }) => {
	return org.default_currency || "usd";
};

export const orgToReturnUrl = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => {
	if (env === AppEnv.Sandbox) {
		return org.stripe_config?.sandbox_success_url || "https://useautumn.com";
	} else {
		return org.stripe_config?.success_url || "https://useautumn.com";
	}
};
