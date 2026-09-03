import open from "open";
import type { BrowserOpener } from "../types/browserOpener";
import { watchLauncher } from "./watchLauncher";

export const openSystemBrowser: BrowserOpener = async ({ url }) => {
	await watchLauncher({ launcher: await open(url) });
};
