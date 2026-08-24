import type { SubjectImport } from "../types/subjectImport.js";
import type { SubjectResidency } from "./types/subjectResidency.js";

export const createSubjectResidency = (): SubjectResidency => {
	const resident = new Set<string>();
	const inFlight = new Map<string, Promise<void>>();
	const loaded: SubjectImport[] = [];

	const isResident = ({ key }: { key: string }) => resident.has(key);

	// The settled promise stays cached until the rows are admitted, so a command
	// arriving in that window joins the finished load instead of re-reading.
	const loadOnce = ({
		key,
		load,
	}: {
		key: string;
		load: () => Promise<SubjectImport>;
	}) => {
		const existing = inFlight.get(key);
		if (existing) return existing;

		const pending = load()
			.then((imported) => {
				loaded.push(imported);
			})
			.catch((error: unknown) => {
				inFlight.delete(key);
				throw error;
			});

		inFlight.set(key, pending);
		return pending;
	};

	const takeLoaded = () => loaded.splice(0);

	const markResident = ({ key }: { key: string }) => {
		resident.add(key);
		inFlight.delete(key);
	};

	return { isResident, loadOnce, takeLoaded, markResident };
};
