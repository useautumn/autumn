import { Request, Response } from "express";
import { CacheManager } from "@/external/caching/CacheManager.js";
import { nanoid } from "nanoid";
import { ExtendedRequest } from "@/utils/models/Request.js";

export class DashboardController {
  static async saveDashboard(req: ExtendedRequest, res: Response) {
    try {
      const { name, filters } = req.body;
      const orgId = req.org.id;
      const userId = req.userId;
      const env = req.env;

      if (!name || !filters) {
        return res.status(400).json({ message: "Name and filters are required" });
      }

      const dashboardId = nanoid(8);
      const dashboard = {
        id: dashboardId,
        name,
        filters,
        created_at: new Date().toISOString(),
        org_id: orgId,
        user_id: userId,
      };

      // Save to Redis with key: dashboards:orgId:env:dashboardId (org+env scoped, no TTL)
      const key = `dashboards:${orgId}:${env}:${dashboardId}`;
      await CacheManager.setJson(key, dashboard); // No TTL - store forever

      // Also save to a list for easy retrieval
      const listKey = `dashboard_list:${orgId}:${env}`;
      const existingDashboards = await CacheManager.getJson(listKey) || [];
      existingDashboards.push(dashboardId);
      await CacheManager.setJson(listKey, existingDashboards); // No TTL

      res.status(201).json({
        message: "Dashboard saved successfully",
        dashboard: {
          id: dashboardId,
          name,
          created_at: dashboard.created_at,
        },
      });
    } catch (error) {
      console.error("Error saving dashboard:", error);
      res.status(500).json({ message: "Failed to save dashboard" });
    }
  }

  static async getDashboards(req: ExtendedRequest, res: Response) {
    try {
      const orgId = req.org.id;
      const env = req.env;

      const listKey = `dashboard_list:${orgId}:${env}`;
      const dashboardIds = await CacheManager.getJson(listKey) || [];

      const dashboards = [];
      for (const dashboardId of dashboardIds) {
        const key = `dashboards:${orgId}:${env}:${dashboardId}`;
        const dashboard = await CacheManager.getJson(key);
        if (dashboard) {
          dashboards.push({
            id: dashboard.id,
            name: dashboard.name,
            filters: dashboard.filters,
            created_at: dashboard.created_at,
          });
        }
      }

      // Sort by creation date (newest first)
      dashboards.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      res.json({ dashboards });
    } catch (error) {
      console.error("Error fetching dashboards:", error);
      res.status(500).json({ message: "Failed to fetch dashboards" });
    }
  }

  static async deleteDashboard(req: ExtendedRequest, res: Response) {
    try {
      const { dashboardId } = req.params;
      const orgId = req.org.id;
      const env = req.env;

      // Delete from Redis
      const key = `dashboards:${orgId}:${env}:${dashboardId}`;
      await CacheManager.invalidate({ action: "", value: key.replace(":", "") });

      // Remove from list
      const listKey = `dashboard_list:${orgId}:${env}`;
      const existingDashboards = await CacheManager.getJson(listKey) || [];
      const updatedDashboards = existingDashboards.filter((id: string) => id !== dashboardId);
      await CacheManager.setJson(listKey, updatedDashboards); // No TTL

      res.json({ message: "Dashboard deleted successfully" });
    } catch (error) {
      console.error("Error deleting dashboard:", error);
      res.status(500).json({ message: "Failed to delete dashboard" });
    }
  }
}