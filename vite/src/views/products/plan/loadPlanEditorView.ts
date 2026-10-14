import { lazyWithPreload } from "@/lib/lazyWithPreload";

export const PlanEditorRoute = lazyWithPreload(
	() => import("./PlanEditorView"),
);
export const loadPlanEditorView = PlanEditorRoute.preload;
