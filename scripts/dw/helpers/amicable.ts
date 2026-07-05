// AMICABLE_HOME (e.g. "tidal-brook.ami") marks a remote devbox whose browser
// lives elsewhere: skip portless, keep URLs on localhost, print .ami links.
import { log } from "./shell.ts";

export function amicableHome(): string | undefined {
	const value = process.env.AMICABLE_HOME?.trim();
	return value ? value : undefined;
}

export function isAmicable(): boolean {
	return amicableHome() !== undefined;
}

export function logAmicableLinks(
	ports: { label: string; port: number }[],
): void {
	const home = amicableHome();
	if (!home) return;
	log("browser links:");
	for (const { label, port } of ports) {
		console.log(`  ${label.padEnd(8)} https://${port}.${home}`);
	}
}
