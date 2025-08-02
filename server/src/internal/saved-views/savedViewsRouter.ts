import { Router } from "express";
import { ViewsService } from "./ViewsService.js";

export const viewsRouter: Router = Router();

// Save view
viewsRouter.post("/save", ViewsService.saveView as any);

// Get all views
viewsRouter.get("/", ViewsService.getViews as any);

// Delete view
viewsRouter.delete("/:viewId", ViewsService.deleteView as any);