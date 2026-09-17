import type { BrowserOpener } from "../types/browserOpener";

/** Never throws: a machine with no browser is a supported way to log in. */
export const tryOpenBrowser = async ({
	url,
	openBrowser,
}: {
	url: string;
	openBrowser: BrowserOpener;
}): Promise<boolean> => {
	try {
		await openBrowser({ url });
		return true;
	} catch {
		return false;
	}
};
