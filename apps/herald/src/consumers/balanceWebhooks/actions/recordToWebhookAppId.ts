import type { MutationRecord } from "@autumn/balance-engine";
import { AppEnv } from "@autumn/shared";
import { svixConfigToAppId } from "@autumn/svix";
import { z } from "zod/v4";

const appEnvSchema = z.enum(AppEnv);

export const recordToWebhookAppId = ({
	record,
}: {
	record: MutationRecord;
}): string | null => {
	const { command, identity } = record;
	if (command.type !== "track" && command.type !== "finalize") return null;
	return svixConfigToAppId({
		svixConfig: command.org.svix,
		env: appEnvSchema.parse(identity.env),
	});
};
