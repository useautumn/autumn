import { ErrCode } from "@autumn/shared";
import { type Response } from "express";
import { nanoid } from "nanoid";
import { CacheManager } from "@/utils/cacheUtils/CacheManager.js";
import RecaseError from "@/utils/errorUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";

export class ViewsService {
	static async saveView(req: ExtendedRequest, res: Response) {
		return routeHandler({
			req,
			res,
			action: "save org view",
			handler: async () => {
				const { name, filters } = req.body;
				const orgId = req.org.id;
				const env = req.env;

				if (!name) {
					throw new RecaseError({
						message: "Name is required",
						code: ErrCode.InvalidRequest,
						statusCode: 400,
					});
				}

				if (!filters) {
					throw new RecaseError({
						message: "Please select some filters first",
						code: ErrCode.InvalidRequest,
						statusCode: 400,
					});
				}

				const viewId = nanoid(8);
				const view = {
					id: viewId,
					name,
					filters,
					created_at: new Date().toISOString(),
					org_id: orgId,
				};

				// Save to Redis with key: saved_views:orgId:env:viewId (org+env scoped, no TTL)
				const key = `saved_views:${orgId}:${env}:${viewId}`;
				await CacheManager.setJson(key, view, "forever"); // No TTL - store forever

				// Also save to a list for easy retrieval
				const listKey = `saved_views_list:${orgId}:${env}`;
				const existingViews = (await CacheManager.getJson(listKey)) || [];
				existingViews.push(viewId);
				await CacheManager.setJson(listKey, existingViews, "forever"); // No TTL

				res.status(201).json({
					message: "View saved successfully",
					view: {
						id: viewId,
						name,
						created_at: view.created_at,
					},
				});
			},
		});
	}

	static async getViews(req: ExtendedRequest, res: Response) {
		return routeHandler({
			req,
			res,
			action: "get org views",
			handler: async () => {
				const orgId = req.org.id;
				const env = req.env;

				const listKey = `saved_views_list:${orgId}:${env}`;
				const viewIds = (await CacheManager.getJson(listKey)) || [];

				const views = [];
				for (const viewId of viewIds) {
					const key = `saved_views:${orgId}:${env}:${viewId}`;
					const view = await CacheManager.getJson(key);
					if (view) {
						views.push({
							id: view.id,
							name: view.name,
							filters: view.filters,
							created_at: view.created_at,
						});
					}
				}

				// Sort by creation date (newest first)
				views.sort(
					(a, b) =>
						new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
				);

				res.json({ views });
			},
		});
	}

	static async deleteView(req: ExtendedRequest, res: Response) {
		return routeHandler({
			req,
			res,
			action: "delete org view",
			handler: async (req: ExtendedRequest, res: Response) => {
				const { viewId } = req.params;
				const orgId = req.org.id;
				const env = req.env;

				// Delete from Redis
				const key = `saved_views:${orgId}:${env}:${viewId}`;
				await CacheManager.invalidate({
					action: "",
					value: key.replace(":", ""),
				});

				// Remove from list
				const listKey = `saved_views_list:${orgId}:${env}`;
				const existingViews = (await CacheManager.getJson(listKey)) || [];
				const updatedViews = existingViews.filter(
					(id: string) => id !== viewId,
				);
				await CacheManager.setJson(listKey, updatedViews, "forever"); // No TTL

				res.json({ message: "View deleted successfully" });
			},
		});
	}
}
