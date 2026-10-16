const PLAIN_NUMBER = /^\d*\.?\d*$/;

/** Strips everything but digits and the first decimal point, so "$1,500.00" becomes "1500.00". */
export const sanitizeNumberInput = ({ text }: { text: string }): string => {
	const [whole, ...decimals] = text.replace(/[^\d.]/g, "").split(".");
	if (decimals.length === 0) return whole;
	return `${whole}.${decimals.join("")}`;
};

/** Groups the integer part with commas; leaves non-plain values like "∞" or "1e-7" untouched. */
export const formatNumberInput = ({ raw }: { raw: string }): string => {
	if (!PLAIN_NUMBER.test(raw)) return raw;
	const [whole, decimal] = raw.split(".");
	const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return decimal === undefined ? grouped : `${grouped}.${decimal}`;
};

const countNumberChars = ({ text }: { text: string }) =>
	text.replace(/[^\d.]/g, "").length;

/** Where the caret lands in `formatted` so the same digits stay to its left. */
export const caretAfterNumberChars = ({
	formatted,
	numberChars,
}: {
	formatted: string;
	numberChars: number;
}): number => {
	let seen = 0;
	for (let index = 0; index < formatted.length; index++) {
		if (seen === numberChars) return index;
		if (/[\d.]/.test(formatted[index])) seen++;
	}
	return formatted.length;
};

/** Backspace or delete on a comma removes the digit beside it instead of doing nothing. */
const removeDigitBesideSeparator = ({
	text,
	caret,
	inputType,
}: {
	text: string;
	caret: number;
	inputType: string | undefined;
}): { text: string; caret: number } => {
	if (inputType === "deleteContentBackward" && caret > 0) {
		return {
			text: text.slice(0, caret - 1) + text.slice(caret),
			caret: caret - 1,
		};
	}
	if (inputType === "deleteContentForward") {
		return { text: text.slice(0, caret) + text.slice(caret + 1), caret };
	}
	return { text, caret };
};

export const editNumberInput = ({
	text,
	caret,
	previousRaw,
	inputType,
}: {
	text: string;
	caret: number;
	previousRaw: string;
	inputType?: string;
}): { raw: string; formatted: string; caret: number } => {
	const deletedOnlySeparator =
		inputType?.startsWith("delete") &&
		sanitizeNumberInput({ text }) === previousRaw;
	const edit = deletedOnlySeparator
		? removeDigitBesideSeparator({ text, caret, inputType })
		: { text, caret };

	const raw = sanitizeNumberInput({ text: edit.text });
	const formatted = formatNumberInput({ raw });
	const numberChars = countNumberChars({
		text: edit.text.slice(0, edit.caret),
	});
	return {
		raw,
		formatted,
		caret: caretAfterNumberChars({ formatted, numberChars }),
	};
};
