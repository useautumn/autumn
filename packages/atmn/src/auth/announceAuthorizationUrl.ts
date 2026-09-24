import { tryOpenBrowser } from "./browser/tryOpenBrowser";
import type { BrowserOpener } from "./types/browserOpener";

/**
 * The URL is printed whether or not a browser opened, so it can be finished on
 * a phone or a laptop when the CLI is running over SSH or in a container.
 */
export const announceAuthorizationUrl = async ({
	url,
	write,
	openBrowser,
}: {
	url: string;
	write: (text: string) => void;
	openBrowser: BrowserOpener;
}): Promise<void> => {
	write(`\nVisit this URL to authenticate:\n\n  ${url}\n\n`);

	const opened = await tryOpenBrowser({ url, openBrowser });

	write(
		opened
			? "Opened your browser. Waiting for authorization...\n"
			: "No browser could be opened here — open the URL above on any machine.\nWaiting for authorization...\n",
	);
};
