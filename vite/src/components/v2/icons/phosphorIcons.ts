import type { Icon } from "@phosphor-icons/react";

type IconModule = Record<string, Icon>;

const iconModules = import.meta.glob<IconModule>(
	"/node_modules/@phosphor-icons/react/dist/csr/*.es.js",
);

const pathToName = (path: string) =>
	path.split("/").pop()?.replace(".es.js", "") ?? "";

const loaderByName = new Map<string, () => Promise<IconModule>>();
for (const [path, loader] of Object.entries(iconModules)) {
	const name = pathToName(path);
	if (name) loaderByName.set(name, loader);
}

export const PHOSPHOR_ICON_NAMES = Array.from(loaderByName.keys()).sort();

export const DEFAULT_PHOSPHOR_ICON = "Link";

/** Shown in the picker before the user searches, so opening loads only a
 *  handful of icon chunks instead of the full result set. */
export const STARTER_PHOSPHOR_ICONS = [
	"Link",
	"ArrowSquareOut",
	"Gauge",
	"ChartLine",
	"Table",
	"Database",
	"Globe",
	"Gear",
	"Lightning",
	"Rocket",
	"Shield",
	"User",
	"CreditCard",
	"Receipt",
	"Envelope",
	"ChatCircle",
	"Bell",
	"Flag",
	"Briefcase",
	"Buildings",
	"Folder",
	"Tag",
	"GithubLogo",
	"SlackLogo",
].filter((name) => loaderByName.has(name));

export const loadPhosphorIcon = async (name: string): Promise<Icon> => {
	const loader =
		loaderByName.get(name) ?? loaderByName.get(DEFAULT_PHOSPHOR_ICON);
	const mod = await loader?.();
	const icon = mod?.[name] ?? mod?.[`${name}Icon`];
	if (!icon) throw new Error(`Phosphor icon not found: ${name}`);
	return icon;
};
