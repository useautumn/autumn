import { type AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import { vercelResources } from "@shared/models/processorModels/vercelModels/vercelResourcesTable.js";
import { and, eq } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type VercelResourceRow = typeof vercelResources.$inferSelect;
export type InsertVercelResource = typeof vercelResources.$inferInsert;

/**
 * Service for managing Vercel integration resources
 * Enforces 1 resource per installation limit
 */
export class VercelResourceService {
	/**
	 * Create a new Vercel resource
	 * @throws RecaseError if installation already has a resource
	 */
	static async create({
		db,
		resource,
	}: {
		db: DrizzleCli;
		resource: InsertVercelResource;
	}): Promise<VercelResourceRow> {
		// Check if installation already has a resource
		const existing = await VercelResourceService.getByInstallation({
			db,
			installationId: resource.installation_id,
			orgId: resource.org_id,
			env: resource.env as AppEnv,
		});

		if (existing) {
			throw new RecaseError({
				message: `Installation ${resource.installation_id} already has a resource (${existing.id}). Only 1 resource per installation is allowed.`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.CONFLICT,
			});
		}

		const [created] = await db
			.insert(vercelResources)
			.values(resource)
			.returning();

		return created;
	}

	/**
	 * Get resource by ID
	 */
	static async getById({
		db,
		resourceId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		resourceId: string;
		orgId: string;
		env: AppEnv;
	}): Promise<VercelResourceRow | undefined> {
		const [resource] = await db
			.select()
			.from(vercelResources)
			.where(
				and(
					eq(vercelResources.id, resourceId),
					eq(vercelResources.org_id, orgId),
					eq(vercelResources.env, env),
				),
			);

		return resource;
	}

	/**
	 * Get resource by installation ID
	 * Returns the single resource for this installation (if exists)
	 */
	static async getByInstallation({
		db,
		installationId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		installationId: string;
		orgId: string;
		env: AppEnv;
	}): Promise<VercelResourceRow | undefined> {
		const [resource] = await db
			.select()
			.from(vercelResources)
			.where(
				and(
					eq(vercelResources.installation_id, installationId),
					eq(vercelResources.org_id, orgId),
					eq(vercelResources.env, env),
				),
			);

		return resource;
	}

	/**
	 * Get resource by ID and validate it belongs to the installation
	 * @throws RecaseError if not found or doesn't belong to installation
	 */
	static async getByIdAndInstallation({
		db,
		resourceId,
		installationId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		resourceId: string;
		installationId: string;
		orgId: string;
		env: AppEnv;
	}): Promise<VercelResourceRow> {
		const [resource] = await db
			.select()
			.from(vercelResources)
			.where(
				and(
					eq(vercelResources.id, resourceId),
					eq(vercelResources.installation_id, installationId),
					eq(vercelResources.org_id, orgId),
					eq(vercelResources.env, env),
				),
			);

		if (!resource) {
			throw new RecaseError({
				message: `Resource ${resourceId} not found for installation ${installationId}`,
				code: ErrCode.VercelResourceNotFound,
				statusCode: StatusCodes.NOT_FOUND,
			});
		}

		return resource;
	}

	/**
	 * Update resource
	 */
	static async update({
		db,
		resourceId,
		installationId,
		orgId,
		env,
		updates,
	}: {
		db: DrizzleCli;
		resourceId: string;
		installationId: string;
		orgId: string;
		env: AppEnv;
		updates: Partial<InsertVercelResource>;
	}): Promise<VercelResourceRow> {
		// First validate resource exists and belongs to installation
		await VercelResourceService.getByIdAndInstallation({
			db,
			resourceId,
			installationId,
			orgId,
			env,
		});

		const [updated] = await db
			.update(vercelResources)
			.set(updates)
			.where(
				and(
					eq(vercelResources.id, resourceId),
					eq(vercelResources.installation_id, installationId),
					eq(vercelResources.org_id, orgId),
					eq(vercelResources.env, env),
				),
			)
			.returning();

		return updated;
	}

	/**
	 * Delete resource (mark as uninstalled)
	 */
	static async delete({
		db,
		resourceId,
		installationId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		resourceId: string;
		installationId: string;
		orgId: string;
		env: AppEnv;
	}): Promise<void> {
		// Validate exists first
		await VercelResourceService.getByIdAndInstallation({
			db,
			resourceId,
			installationId,
			orgId,
			env,
		});

		// Mark as uninstalled rather than hard delete
		await db
			.update(vercelResources)
			.set({ status: "uninstalled" })
			.where(
				and(
					eq(vercelResources.id, resourceId),
					eq(vercelResources.installation_id, installationId),
					eq(vercelResources.org_id, orgId),
					eq(vercelResources.env, env),
				),
			);
	}

	/**
	 * Hard delete resource (for cleanup)
	 */
	static async hardDelete({
		db,
		resourceId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		resourceId: string;
		orgId: string;
		env: AppEnv;
	}): Promise<void> {
		await db
			.delete(vercelResources)
			.where(
				and(
					eq(vercelResources.id, resourceId),
					eq(vercelResources.org_id, orgId),
					eq(vercelResources.env, env),
				),
			);
	}

	/**
	 * List all resources for installation
	 */
	static async listByInstallation({
		db,
		installationId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		installationId: string;
		orgId: string;
		env: AppEnv;
	}): Promise<VercelResourceRow[]> {
		return await db
			.select()
			.from(vercelResources)
			.where(
				and(
					eq(vercelResources.installation_id, installationId),
					eq(vercelResources.org_id, orgId),
					eq(vercelResources.env, env),
				),
			);
	}

	/**
	 * Count resources for installation (should always be 0 or 1)
	 * Uses proper Drizzle count aggregation
	 */
	static async countByInstallation({
		db,
		installationId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		installationId: string;
		orgId: string;
		env: AppEnv;
	}): Promise<number> {
		const [result] = await db
			.select({ count: db.$count(vercelResources.id) })
			.from(vercelResources)
			.where(
				and(
					eq(vercelResources.installation_id, installationId),
					eq(vercelResources.org_id, orgId),
					eq(vercelResources.env, env),
				),
			);

		return result?.count ?? 0;
	}
}
