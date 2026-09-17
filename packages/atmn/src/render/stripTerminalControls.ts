/**
 * ESC-initiated sequences: CSI (`ESC [ ... final`), OSC (`ESC ] ... BEL|ST`),
 * and the two-character escapes. Matched before the bare control characters,
 * so a whole sequence goes rather than just its ESC.
 */
const ESCAPE_SEQUENCE =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point
	/\u001b(?:\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|\][\s\S]*?(?:\u0007|\u001b\\|$)|[\x40-\x5a\x5c-\x5f])/g;

// biome-ignore lint/suspicious/noControlCharactersInRegex: C0 controls, DEL and C1
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Text a terminal prints as text. A name comes from the server, which only
 * requires its derived slug to hold a letter or a digit, so an escape sequence
 * in one could otherwise repaint or disguise the output around it.
 */
export const stripTerminalControls = (text: string): string =>
	text.replace(ESCAPE_SEQUENCE, "").replace(CONTROL_CHARACTER, "");
