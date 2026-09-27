import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getSlackConnectClient,
	inviteToOrgSlackChannel,
} from "./slackConnectClient.js";

export const handleRequestSlackInvite = createRoute({
	scopes: [Scopes.Public],
	handler: async (c) => {
		const ctx = c.get("ctx");
		// Always the signed-in user's own address, never one from the body, so
		// this can't be used to send invites to arbitrary emails.
		const email = ctx.user?.email;

		if (!email) {
			throw new RecaseError({
				message: "Slack invites need a signed-in user with an email",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const client = await getSlackConnectClient({ db: ctx.db });
		if (!client) {
			ctx.logger.warn(
				"Slack invite requested, but the Slack admin bot isn't installed with the Slack Connect scopes",
			);
			throw new RecaseError({
				message: "Slack invites are not available right now",
				code: ErrCode.InternalError,
				statusCode: 503,
			});
		}

		try {
			const { channelName } = await inviteToOrgSlackChannel({
				client,
				orgSlug: ctx.org.slug,
				email,
			});
			ctx.logger.info(
				`Sent Slack Connect invite for #${channelName} to ${email}`,
			);
			return c.json({ email, channel_name: channelName });
		} catch (error) {
			ctx.logger.error("Failed to send Slack Connect invite", { error });
			throw new RecaseError({
				message: "Failed to send the Slack invite, please try again",
				code: ErrCode.InternalError,
				statusCode: 502,
			});
		}
	},
});
