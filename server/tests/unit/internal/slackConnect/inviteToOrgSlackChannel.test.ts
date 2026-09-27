import { describe, expect, test } from "bun:test";
import type { WebClient } from "@slack/web-api";
import {
	inviteToOrgSlackChannel,
	MAX_SLACK_CHANNELS_PER_ORG,
	SlackChannelLimitError,
	SlackChannelNameTakenError,
} from "@/internal/misc/slackConnect/slackConnectClient.js";

const BOT_USER_ID = "U_BOT";
const ORG_ID = "org_1";
const EMAIL = "user@example.com";

type FakeChannel = {
	id: string;
	name: string;
	creator?: string;
	is_archived?: boolean;
	purpose?: { value: string };
};

const orgPurpose = (orgId: string) =>
	`Shared support channel with Autumn (${orgId})`;

const slackError = (code: string) =>
	Object.assign(new Error(code), { data: { error: code } });

/** In-memory stand-in for the Slack methods the invite flow calls. */
const createFakeSlack = ({
	channels = [],
	privateNames = [],
}: {
	channels?: FakeChannel[];
	privateNames?: string[];
}) => {
	const calls: { method: string; args: Record<string, unknown> }[] = [];
	const record = (method: string, args: Record<string, unknown>) =>
		calls.push({ method, args });

	const slack = {
		conversations: {
			list: async (args: Record<string, unknown>) => {
				record("list", args);
				return { channels, response_metadata: { next_cursor: "" } };
			},
			create: async (args: { name: string }) => {
				record("create", args);
				const taken =
					privateNames.includes(args.name) ||
					channels.some((channel) => channel.name === args.name);
				if (taken) throw slackError("name_taken");
				const channel: FakeChannel = {
					id: `C_${args.name}`,
					name: args.name,
					creator: BOT_USER_ID,
				};
				channels.push(channel);
				return { channel: { id: channel.id } };
			},
			setPurpose: async (args: { channel: string; purpose: string }) => {
				record("setPurpose", args);
				const channel = channels.find((c) => c.id === args.channel);
				if (channel) channel.purpose = { value: args.purpose };
				return {};
			},
			invite: async (args: Record<string, unknown>) => {
				record("invite", args);
				return {};
			},
			unarchive: async (args: { channel: string }) => {
				record("unarchive", args);
				return {};
			},
			inviteShared: async (args: Record<string, unknown>) => {
				record("inviteShared", args);
				return {};
			},
		},
	};

	return {
		client: {
			slack: slack as unknown as WebClient,
			botUserId: BOT_USER_ID,
			teamUserIds: ["U_TEAM"],
		},
		calls,
		methods: () => calls.map((call) => call.method),
	};
};

const invite = ({
	client,
	requestedName,
}: {
	client: ReturnType<typeof createFakeSlack>["client"];
	requestedName: string;
}) =>
	inviteToOrgSlackChannel({
		client,
		orgId: ORG_ID,
		requestedName,
		email: EMAIL,
	});

describe("inviteToOrgSlackChannel", () => {
	test("creates, stamps and invites to a new channel", async () => {
		const fake = createFakeSlack({});

		const result = await invite({ client: fake.client, requestedName: "acme" });

		expect(result.channelName).toBe("autumn-acme");
		expect(fake.methods()).toEqual([
			"list",
			"create",
			"setPurpose",
			"invite",
			"inviteShared",
		]);
	});

	test("reuses the org's own channel without creating one", async () => {
		const fake = createFakeSlack({
			channels: [
				{
					id: "C1",
					name: "autumn-acme",
					purpose: { value: orgPurpose(ORG_ID) },
				},
			],
		});

		await invite({ client: fake.client, requestedName: "acme" });

		expect(fake.methods()).toEqual(["list", "inviteShared"]);
	});

	test("unarchives the org's own archived channel", async () => {
		const fake = createFakeSlack({
			channels: [
				{
					id: "C1",
					name: "autumn-acme",
					is_archived: true,
					purpose: { value: orgPurpose(ORG_ID) },
				},
			],
		});

		await invite({ client: fake.client, requestedName: "acme" });

		expect(fake.methods()).toEqual(["list", "unarchive", "inviteShared"]);
	});

	test("rejects a channel owned by another org", async () => {
		const fake = createFakeSlack({
			channels: [
				{
					id: "C1",
					name: "autumn-acme",
					purpose: { value: orgPurpose("org_2") },
				},
			],
		});

		await expect(
			invite({ client: fake.client, requestedName: "acme" }),
		).rejects.toBeInstanceOf(SlackChannelNameTakenError);
		expect(fake.methods()).toEqual(["list"]);
	});

	test("rejects a name held by a private channel as taken", async () => {
		const fake = createFakeSlack({ privateNames: ["autumn-acme"] });

		await expect(
			invite({ client: fake.client, requestedName: "acme" }),
		).rejects.toBeInstanceOf(SlackChannelNameTakenError);
	});

	test(`caps an org at ${MAX_SLACK_CHANNELS_PER_ORG} channels, archived ones included`, async () => {
		const fake = createFakeSlack({
			channels: [
				{
					id: "C1",
					name: "autumn-one",
					purpose: { value: orgPurpose(ORG_ID) },
				},
				{
					id: "C2",
					name: "autumn-two",
					is_archived: true,
					purpose: { value: orgPurpose(ORG_ID) },
				},
			],
		});

		const error = await invite({
			client: fake.client,
			requestedName: "three",
		}).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(SlackChannelLimitError);
		expect((error as Error).message).toContain("#autumn-one, #autumn-two");
		expect(fake.methods()).toEqual(["list"]);
	});

	test("still reuses an existing channel when the org is at the cap", async () => {
		const fake = createFakeSlack({
			channels: [
				{
					id: "C1",
					name: "autumn-one",
					purpose: { value: orgPurpose(ORG_ID) },
				},
				{
					id: "C2",
					name: "autumn-two",
					purpose: { value: orgPurpose(ORG_ID) },
				},
			],
		});

		await invite({ client: fake.client, requestedName: "two" });

		expect(fake.methods()).toEqual(["list", "inviteShared"]);
	});

	test("other orgs' channels don't count toward the cap", async () => {
		const fake = createFakeSlack({
			channels: [
				{
					id: "C1",
					name: "autumn-one",
					purpose: { value: orgPurpose("org_2") },
				},
				{
					id: "C2",
					name: "autumn-two",
					purpose: { value: orgPurpose("org_2") },
				},
			],
		});

		const result = await invite({ client: fake.client, requestedName: "acme" });

		expect(result.channelName).toBe("autumn-acme");
	});

	test("claims a channel the bot created but never stamped", async () => {
		const fake = createFakeSlack({
			channels: [{ id: "C1", name: "autumn-acme", creator: BOT_USER_ID }],
		});

		await invite({ client: fake.client, requestedName: "acme" });

		expect(fake.methods()).toEqual([
			"list",
			"setPurpose",
			"invite",
			"inviteShared",
		]);
		expect(fake.calls[1].args).toEqual({
			channel: "C1",
			purpose: orgPurpose(ORG_ID),
		});
	});

	test("won't claim an unstamped channel someone else created", async () => {
		const fake = createFakeSlack({
			channels: [{ id: "C1", name: "autumn-acme", creator: "U_HUMAN" }],
		});

		await expect(
			invite({ client: fake.client, requestedName: "acme" }),
		).rejects.toBeInstanceOf(SlackChannelNameTakenError);
	});
});
