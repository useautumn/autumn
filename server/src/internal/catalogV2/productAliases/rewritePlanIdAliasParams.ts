const PLAN_ID_PATH_PARAMS = new Set(["product_id", "productId"]);

type ParamFn = {
	(key: string): string | undefined;
	(): Record<string, string>;
};

const rewriteValue = ({
	key,
	value,
	aliases,
}: {
	key: string;
	value: string | undefined;
	aliases: Record<string, string>;
}): string | undefined => {
	if (!value || !PLAN_ID_PATH_PARAMS.has(key)) return value;
	return aliases[value] ?? value;
};

/** Wraps `c.req.param` so `product_id` / `productId` resolve through the alias map. */
export const rewritePlanIdAliasParams = ({
	param,
	aliases,
}: {
	param: ParamFn;
	aliases: Record<string, string>;
}): ParamFn => {
	return ((key?: string) => {
		if (key) {
			return rewriteValue({ key, value: param(key), aliases });
		}

		const all = param();
		for (const pathKey of PLAN_ID_PATH_PARAMS) {
			const value = all[pathKey];
			if (value) all[pathKey] = aliases[value] ?? value;
		}
		return all;
	}) as ParamFn;
};
