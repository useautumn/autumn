export const getEntityExpandStr = (expand?: string[]) => {
	if (!expand) {
		return "";
	}
	return `expand=${expand.join(",")}`;
};
