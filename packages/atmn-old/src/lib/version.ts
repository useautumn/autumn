declare const VERSION: string;

export const APP_VERSION: string =
	typeof VERSION !== "undefined" && VERSION ? VERSION : "dev";
