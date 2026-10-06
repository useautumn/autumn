import { join } from "node:path";

const stableVersion = /^\d+\.\d+\.\d+$/;

export const AUTUMN_JS_PIN_MANIFESTS = [
	"server/package.json",
	"packages/billing/package.json",
];

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

// Usage: bun pinAutumnJs.ts <repo root> <version>
if (import.meta.main) {
	const [root, version] = process.argv.slice(2);
	if (!root || !version)
		throw new Error("Usage: pinAutumnJs.ts <root> <version>");
	for (const path of AUTUMN_JS_PIN_MANIFESTS) {
		const file = Bun.file(join(root, path));
		await Bun.write(
			file,
			pinDependency({
				manifestText: await file.text(),
				name: "autumn-js",
				version,
			}),
		);
		console.log(`${path}: autumn-js ${version}`);
	}
}
