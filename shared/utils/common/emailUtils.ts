const CONTROL_CHARS_REGEX = new RegExp("[\\u0000-\\u001F\\u007F]");
const LOCAL_CHARS_REGEX = /^[A-Za-z0-9._'+%\-]+$/;
const DOMAIN_LABEL_REGEX = /^[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?$/;

export const isPermissiveEmail = (value: string): boolean => {
	if (typeof value !== "string") return false;
	if (value.length === 0 || value.length > 254) return false;
	if (CONTROL_CHARS_REGEX.test(value)) return false;
	if (/\s/.test(value)) return false;

	const atIdx = value.indexOf("@");
	if (atIdx <= 0 || atIdx === value.length - 1) return false;

	const local = value.slice(0, atIdx);
	const domain = value.slice(atIdx + 1);

	if (local.includes("@") || domain.includes("@")) return false;

	if (local.length > 64) return false;
	if (local.startsWith(".") || local.endsWith(".")) return false;
	if (local.includes("..")) return false;
	if (!LOCAL_CHARS_REGEX.test(local)) return false;

	if (domain.length === 0 || domain.length > 253) return false;
	if (!domain.includes(".")) return false;

	const labels = domain.split(".");
	for (const label of labels) {
		if (label.length === 0 || label.length > 63) return false;
		if (!DOMAIN_LABEL_REGEX.test(label)) return false;
	}

	const tld = labels[labels.length - 1];
	if (tld.length < 2) return false;
	if (!/[A-Za-z]/.test(tld)) return false;

	return true;
};
