import type { TwdContext } from "../../../lib/types/twdContext.ts";

export const getWebOrigins = () =>
	(process.env.TWD_WEB_ORIGIN ?? "")
		.split(",")
		.map((origin) => origin.trim().replace(/\/$/, ""))
		.filter(Boolean);

export const safeRedirect = ({
	ctx,
	target,
}: {
	ctx: TwdContext;
	target: string | undefined;
}) => {
	if (!target) return "/";
	if (target.startsWith("/") && !/^\/[/\\]/.test(target)) return target;
	try {
		const url = new URL(target);
		const allowed = [
			new URL(ctx.env.TWD_PUBLIC_URL).origin,
			...getWebOrigins(),
		];
		return allowed.includes(url.origin) ? url.toString() : "/";
	} catch {
		return "/";
	}
};
