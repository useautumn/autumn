import { Router } from "express";
import { DashboardController } from "./DashboardController.js";

export const dashboardRouter: Router = Router();

// Save dashboard
dashboardRouter.post("/save", DashboardController.saveDashboard as any);

// Get all dashboards
dashboardRouter.get("/", DashboardController.getDashboards as any);

// Delete dashboard
dashboardRouter.delete("/:dashboardId", DashboardController.deleteDashboard as any);