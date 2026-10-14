import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import chalk from "chalk";
import { atomTestClient } from "./utils/atomTestClient.js";

test(`${chalk.yellowBright("atom-feature-gate1: an org without atoms cannot manage its Atom")}`, async () => {
	const autumn = atomTestClient({ atoms: false });

	await expectAutumnError({
		errCode: ErrCode.FeatureLimitReached,
		errMessage: "Atom isn't included in your plan",
		func: () => autumn.post("/byoc.get_atom", {}),
	});
});

test(`${chalk.yellowBright("atom-feature-gate2: an org with atoms can manage its Atom")}`, async () => {
	const autumn = atomTestClient({ atoms: true });

	const fetched = await autumn.post("/byoc.get_atom", {});

	expect(fetched).toHaveProperty("cache");
});
