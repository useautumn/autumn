const PRODUCTION_DASHBOARD_HOST = "app.useautumn.com";

/** UI-only guard: an admin can still call update on prod, the modal just won't. */
export const isCatalogImportBlocked = ({ hostname }: { hostname: string }) =>
	hostname === PRODUCTION_DASHBOARD_HOST;
