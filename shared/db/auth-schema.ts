import {
	boolean,
	foreignKey,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import {
	type Organization,
	organizations,
} from "../models/orgModels/orgTable.js";
import { sqlNow } from "./utils.js";

export const user = pgTable(
	"user",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: boolean("email_verified")
			.$defaultFn(() => false)
			.notNull(),
		image: text("image"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		role: text("role"),
		banned: boolean("banned"),
		banReason: text("ban_reason"),
		banExpires: timestamp("ban_expires", { withTimezone: true }),
		createdBy: text("created_by"),
		lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
	},
	(table) => [
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [organizations.id],
			name: "user_created_by_fkey",
		}),
	],
);

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	impersonatedBy: text("impersonated_by"),
	activeOrganizationId: text("active_organization_id"),
	city: text("city"),
	country: text("country"),
}).enableRLS();

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}).enableRLS();

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).$defaultFn(
		() => /* @__PURE__ */ new Date(),
	),
	updatedAt: timestamp("updated_at", { withTimezone: true }).$defaultFn(
		() => /* @__PURE__ */ new Date(),
	),
}).enableRLS();

export const member = pgTable("member", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organizations.id, { onDelete: "cascade" }),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	role: text("role").default("member").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}).enableRLS();

export const invitation = pgTable("invitation", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organizations.id, { onDelete: "cascade" }),
	email: text("email").notNull(),
	role: text("role"),
	status: text("status").default("pending").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.default(sqlNow),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	inviterId: text("inviter_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
}).enableRLS();

export const bannedUser = pgTable("banned_user", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	banReason: text("ban_reason"),
	banExpires: timestamp("ban_expires", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.$defaultFn(() => new Date()),
	revokedAt: timestamp("revoked_at", { withTimezone: true }),
}).enableRLS();

export const authSchema = {
	user,
	session,
	account,
	verification,
	member,
	invitation,
	bannedUser,
	organizations,
};

export type User = typeof user.$inferSelect;
export type Member = typeof member.$inferSelect;
export type Invite = typeof invitation.$inferSelect;
export type BannedUser = typeof bannedUser.$inferSelect;

export type FullInvite = Invite & {
	inviter: User;
	organization: Organization;
};
