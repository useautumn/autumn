import { ATOM_FORWARDED_REQUEST_HEADER } from "@autumn/byoc";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const ATOM_FORWARDED_REQUEST_KEY = "atomForwardedRequest";

/** A request the Atom forwarded names itself with the header; the mark is read wherever its caller's key is claimed. */
export const markAtomForwardedRequest = ({
	ctx,
	header,
}: {
	ctx: AutumnContext;
	header: (name: string) => string | undefined;
}): void => {
	ctx.state[ATOM_FORWARDED_REQUEST_KEY] =
		header(ATOM_FORWARDED_REQUEST_HEADER) !== undefined;
};

export const isAtomForwardedRequest = ({
	ctx,
}: {
	ctx: AutumnContext;
}): boolean => ctx.state?.[ATOM_FORWARDED_REQUEST_KEY] === true;
