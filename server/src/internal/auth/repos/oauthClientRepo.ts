import { oauthClient } from "@autumn/shared";
import { desc, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type OAuthClientRecord = {
	id: string;
	clientId: string;
	name: string | null;
	redirectUris: string[];
	scopes: string[] | null;
	metadata: unknown;
	createdAt: Date | null;
};

const oauthClientSelect = {
	id: oauthClient.id,
	clientId: oauthClient.clientId,
	name: oauthClient.name,
	redirectUris: oauthClient.redirectUris,
	scopes: oauthClient.scopes,
	metadata: oauthClient.metadata,
	createdAt: oauthClient.createdAt,
};

export const listOAuthClients = async ({ db }: { db: DrizzleCli }) =>
	db.select(oauthClientSelect).from(oauthClient);

export const listOAuthClientsForAdmin = async ({ db }: { db: DrizzleCli }) =>
	db
		.select({
			id: oauthClient.id,
			clientId: oauthClient.clientId,
			name: oauthClient.name,
			redirectUris: oauthClient.redirectUris,
			public: oauthClient.public,
			disabled: oauthClient.disabled,
			skipConsent: oauthClient.skipConsent,
			scopes: oauthClient.scopes,
			tokenEndpointAuthMethod: oauthClient.tokenEndpointAuthMethod,
			grantTypes: oauthClient.grantTypes,
			responseTypes: oauthClient.responseTypes,
			createdAt: oauthClient.createdAt,
			updatedAt: oauthClient.updatedAt,
		})
		.from(oauthClient)
		.orderBy(desc(oauthClient.createdAt));

export const getOAuthClientByClientId = async ({
	db,
	clientId,
}: {
	db: DrizzleCli;
	clientId: string;
}) => {
	const [client] = await db
		.select(oauthClientSelect)
		.from(oauthClient)
		.where(eq(oauthClient.clientId, clientId))
		.limit(1);

	return client ?? null;
};

export const updateOAuthClientById = async ({
	db,
	id,
	updates,
}: {
	db: DrizzleCli;
	id: string;
	updates: {
		name: string;
		redirectUris: string[];
		scopes: string[];
		tokenEndpointAuthMethod: string;
		grantTypes: string[];
		responseTypes: string[];
		public: boolean;
		type: string;
		metadata: unknown;
		updatedAt: Date;
	};
}) => {
	const [client] = await db
		.update(oauthClient)
		.set(updates)
		.where(eq(oauthClient.id, id))
		.returning(oauthClientSelect);

	return client ?? null;
};

export const upsertOAuthClient = async ({
	db,
	insert,
	update,
}: {
	db: DrizzleCli;
	insert: {
		id: string;
		clientId: string;
		name: string;
		redirectUris: string[];
		scopes: string[];
		tokenEndpointAuthMethod: string;
		grantTypes: string[];
		responseTypes: string[];
		public: boolean;
		type: string;
		metadata: unknown;
		createdAt: Date;
		updatedAt: Date;
	};
	update: {
		name: string;
		redirectUris: string[];
		scopes: string[];
		tokenEndpointAuthMethod: string;
		grantTypes: string[];
		responseTypes: string[];
		public: boolean;
		type: string;
		metadata: unknown;
		updatedAt: Date;
	};
}) => {
	await db.insert(oauthClient).values(insert).onConflictDoUpdate({
		target: oauthClient.clientId,
		set: update,
	});

	return getOAuthClientByClientId({ db, clientId: insert.clientId });
};

export const addOAuthClientScopesByClientId = async ({
	db,
	clientId,
	scopes,
}: {
	db: DrizzleCli;
	clientId: string;
	scopes: string[];
}) => {
	if (scopes.length === 0) return getOAuthClientByClientId({ db, clientId });

	const addArray = sql`ARRAY[${sql.join(
		scopes.map((s) => sql`${s}`),
		sql`, `,
	)}]::text[]`;

	const [client] = await db
		.update(oauthClient)
		.set({
			scopes: sql`(
				SELECT array_agg(DISTINCT s)
				FROM unnest(
					array_cat(coalesce(${oauthClient.scopes}, ARRAY[]::text[]), ${addArray})
				) AS s
			)`,
			updatedAt: new Date(),
		})
		.where(eq(oauthClient.clientId, clientId))
		.returning(oauthClientSelect);

	return client ?? null;
};

export const oauthClientRepo = {
	list: listOAuthClients,
	listForAdmin: listOAuthClientsForAdmin,
	getByClientId: getOAuthClientByClientId,
	updateById: updateOAuthClientById,
	addScopesByClientId: addOAuthClientScopesByClientId,
	upsert: upsertOAuthClient,
};
