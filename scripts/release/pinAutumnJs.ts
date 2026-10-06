import { appendFileSync } from "node:fs";
import { join } from "node:path";

const stableVersion = /^\d+\.\d+\.\d+$/;

export const AUTUMN_JS_PIN_MANIFESTS = [
	"server/package.json",
	"packages/billing/package.json",
];

export const readMinimumReleaseAge = ({
	bunfigText,
}: {
	bunfigText: string;
}) => {
	const config = Bun.TOML.parse(bunfigText) as {
		install?: { minimumReleaseAge?: unknown };
	};
	const seconds = config.install?.minimumReleaseAge;
	if (typeof seconds !== "number") {
		throw new Error("bunfig.toml has no [install] minimumReleaseAge");
	}
	return seconds;
};

// The newest stable version bun's release-age gate will install right now.
export const selectEligibleVersion = ({
	time,
	minimumReleaseAgeSeconds,
	now,
}: {
	time: Record<string, string>;
	minimumReleaseAgeSeconds: number;
	now: number;
}) =>
	Object.entries(time)
		.filter(
			([version, publishedAt]) =>
				stableVersion.test(version) &&
				now - Date.parse(publishedAt) >= minimumReleaseAgeSeconds * 1000,
		)
		.map(([version]) => version)
		.sort(Bun.semver.order)
		.at(-1);

export const pinDependency = ({
	manifestText,
	name,
	version,
}: {
	manifestText: string;
	name: string;
	version: string;
}) => {
	if (!stableVersion.test(version)) {
		throw new Error(`Pin must be an exact stable version: ${version}`);
	}
	const pin = new RegExp(`("${name}": ")[^"]+(")`);
	if (!pin.test(manifestText)) throw new Error(`No ${name} dependency to pin`);
	return manifestText.replace(pin, `$1${version}$2`);
};

// Usage: bun pinAutumnJs.ts <repo root>; writes `version=` to GITHUB_OUTPUT when it bumps.
if (import.meta.main) {
	const [root] = process.argv.slice(2);
	if (!root) throw new Error("Usage: pinAutumnJs.ts <root>");
	const response = await fetch("https://registry.npmjs.org/autumn-js", {
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) throw new Error(`npm registry: HTTP ${response.status}`);
	const { time } = (await response.json()) as { time: Record<string, string> };
	const eligible = selectEligibleVersion({
		time,
		minimumReleaseAgeSeconds: readMinimumReleaseAge({
			bunfigText: await Bun.file(join(root, "bunfig.toml")).text(),
		}),
		now: Date.now(),
	});
	const current = (
		await Bun.file(join(root, AUTUMN_JS_PIN_MANIFESTS[0])).json()
	).dependencies["autumn-js"];
	if (!eligible || Bun.semver.order(eligible, current) <= 0) {
		console.log(`autumn-js ${current} is already the newest eligible pin.`);
		process.exit(0);
	}
	for (const path of AUTUMN_JS_PIN_MANIFESTS) {
		const file = Bun.file(join(root, path));
		await Bun.write(
			file,
			pinDependency({
				manifestText: await file.text(),
				name: "autumn-js",
				version: eligible,
			}),
		);
	}
	console.log(`autumn-js ${current} -> ${eligible}`);
	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(process.env.GITHUB_OUTPUT, `version=${eligible}\n`);
	}
}
