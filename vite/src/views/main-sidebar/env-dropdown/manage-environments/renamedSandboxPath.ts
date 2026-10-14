import { sandboxSlug } from "@autumn/shared";
import { SANDBOX_PREFIX, stripSandboxPrefix } from "@/hooks/sandbox/sandboxUrl";

export const renamedSandboxPath = ({
	pathname,
	search,
	name,
}: {
	pathname: string;
	search: string;
	name: string;
}) =>
	`${SANDBOX_PREFIX}/${sandboxSlug(name)}${stripSandboxPrefix(pathname)}${search}`;
