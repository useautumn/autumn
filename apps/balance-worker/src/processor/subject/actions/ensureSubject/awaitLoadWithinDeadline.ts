import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { readAnswerDeadline } from "../../../../runtime/answerDeadline.js";
import { SubjectLoadBusyError } from "../../subjectErrors.js";

const EXPIRED = Symbol("expired");

function ignoreAbandonedLoadFailure(): void {}

export async function awaitLoadWithinDeadline({
	identity,
	load,
}: {
	identity: MeteringIdentity;
	load: Promise<SubjectState>;
}): Promise<SubjectState> {
	const expiresAt = readAnswerDeadline();
	if (expiresAt === undefined) return load;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const expiry = new Promise<typeof EXPIRED>((resolve) => {
		timer = setTimeout(
			() => resolve(EXPIRED),
			Math.max(expiresAt - performance.now(), 0),
		);
	});
	try {
		const outcome = await Promise.race([load, expiry]);
		if (outcome !== EXPIRED) return outcome;
	} finally {
		clearTimeout(timer);
	}
	load.catch(ignoreAbandonedLoadFailure);
	throw new SubjectLoadBusyError({ identity });
}
