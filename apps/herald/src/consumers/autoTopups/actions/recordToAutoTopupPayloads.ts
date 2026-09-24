import type { AutoTopupJobPayload } from "@autumn/auto-topup";
import type { MutationRecord } from "@autumn/balance-engine";
import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";

const appEnvSchema = z.enum(AppEnv);

/** One job per auto top-up the worker decided: the record's identity names the customer, the effect names the feature. */
export const recordToAutoTopupPayloads = ({
	record,
}: {
	record: MutationRecord;
}): AutoTopupJobPayload[] => {
	const { orgId, env, customerId } = record.identity;
	return (record.effects ?? []).flatMap((effect) =>
		effect.type === "auto_topup"
			? [
					{
						orgId,
						env: appEnvSchema.parse(env),
						customerId,
						featureId: effect.featureId,
					},
				]
			: [],
	);
};
