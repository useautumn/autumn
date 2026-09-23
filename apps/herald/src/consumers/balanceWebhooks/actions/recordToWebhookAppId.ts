import type { MutationRecord } from "@autumn/balance-engine";
import { AppEnv } from "@autumn/shared";
import { svixConfigToAppId } from "@autumn/svix";
import { z } from "zod/v4";

const appEnvSchema = z.enum(AppEnv);

/** The app the record's org delivers through, as stamped when the balance moved; null on older records or an org with none. */
export const recordToWebhookAppId = ({
	record,
}: {
	record: MutationRecord;
}): string | null => {
	const { command, identity } = record;
	// Only the commands that move a balance name the org; an initialize does not, and fires nothing anyway.
	if (command.type !== "track" && command.type !== "finalize") return null;
	return svixConfigToAppId({
		svixConfig: command.org.svix,
		env: appEnvSchema.parse(identity.env),
	});
};
