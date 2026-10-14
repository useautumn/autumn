import type { SubjectRowText } from "../repos/subjectStates.js";
import type { StoredSubject } from "./storedSubject.js";

/**
 * A subject as one thread holds it: its row text always, and its parsed copy while the thread keeps deciding on it.
 * The row text is what the held budget counts; a parsed copy costs the collector hundreds of cells, the text one.
 */
export type HeldSubject = {
	text: SubjectRowText;
	/** Null once the parsed tier let it go: the next read parses the text again. */
	subject: StoredSubject | null;
	bytes: number;
};
