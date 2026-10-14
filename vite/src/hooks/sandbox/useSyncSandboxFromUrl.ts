import { sandboxSlug } from "@autumn/shared";
import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { useOrg } from "@/hooks/common/useOrg";
import { useSandboxesQuery } from "@/hooks/queries/useSandboxesQuery";
import {
	getSandboxSlugFromPath,
	SANDBOX_PREFIX,
} from "@/hooks/sandbox/sandboxUrl";
import {
	getActiveSandbox,
	setActiveSandbox,
	useActiveSandbox,
} from "@/hooks/sandbox/useActiveSandbox";

export const useSyncSandboxFromUrl = () => {
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const { org, isLoading: orgLoading } = useOrg();
	const { sandboxes, isSuccess, error } = useSandboxesQuery({
		enabled: !!org?.deployed,
	});
	const active = useActiveSandbox();

	const slug = getSandboxSlugFromPath(pathname);
	const inSandboxEnv = pathname.startsWith(SANDBOX_PREFIX);

	const listUnavailable = !!error || (!orgLoading && !!org && !org.deployed);

	const match = useMemo(
		() =>
			slug && isSuccess
				? sandboxes.find((sandbox) => sandboxSlug(sandbox.name) === slug)
				: undefined,
		[slug, isSuccess, sandboxes],
	);

	useEffect(() => {
		if (!slug) {
			if (inSandboxEnv && getActiveSandbox()) {
				setActiveSandbox(null);
			}
			return;
		}
		if (!isSuccess) {
			return;
		}
		if (match) {
			if (getActiveSandbox()?.id !== match.id) {
				setActiveSandbox({
					id: match.id,
					name: match.name,
					color: match.color,
					icon: match.icon,
				});
			}
			return;
		}
		setActiveSandbox(null);
		navigate(`${SANDBOX_PREFIX}/products`, { replace: true });
	}, [slug, inSandboxEnv, isSuccess, match, navigate]);

	const matchesActive =
		active != null && slug != null && sandboxSlug(active.name) === slug;

	const sandboxUrlResolved = !slug || matchesActive || listUnavailable;

	return { sandboxUrlResolved };
};
