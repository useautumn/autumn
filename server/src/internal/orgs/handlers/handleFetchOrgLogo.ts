import { ErrCode, InternalError, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import {
	getOrgLogoKey,
	getOrgLogoPublicUrl,
	getOrgLogoS3Credentials,
	getPublicAssetsS3Config,
} from "@/external/aws/s3/publicAssetsS3Config.js";
import { getS3PresignedPutUrl } from "@/external/aws/s3/s3PresignUtils.js";
import {
	ContextDevError,
	type ContextDevLogo,
	retrieveBrandByDomain,
} from "@/external/contextDev/contextDevClient.js";
import { createRoute } from "../../../honoMiddlewares/routeHandler";

const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const LOGO_DOWNLOAD_TIMEOUT_MS = 15_000;
const LOGO_CDN_HOST_SUFFIXES = [".brand.dev", ".context.dev"] as const;

const bodySchema = z.object({
	url: z.string().trim().min(1).max(2048),
});

const invalidDomainError = () =>
	new RecaseError({
		message: "Enter a valid website URL, e.g. stripe.com",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});

/** Accepts "stripe.com", "https://www.stripe.com/pricing", etc. and returns "stripe.com". */
const toDomain = (input: string) => {
	const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
		? input
		: `https://${input}`;

	let hostname: string;
	try {
		hostname = new URL(withProtocol).hostname.toLowerCase();
	} catch {
		throw invalidDomainError();
	}

	const domain = hostname.replace(/^www\./, "");
	if (!domain.includes(".")) throw invalidDomainError();
	return domain;
};

const getAspectRatio = (logo: ContextDevLogo) => {
	const { width, height, aspect_ratio } = logo.resolution ?? {};
	if (aspect_ratio) return aspect_ratio;
	if (width && height) return width / height;
	return 1;
};

// The org logo renders as a small square, so prefer square icons (favicons /
// app icons) over wide wordmarks, then prefer the highest resolution.
const pickBestLogo = (logos: ContextDevLogo[]) => {
	const scoreLogo = (logo: ContextDevLogo) => {
		const isIcon = logo.type === "icon" ? 1 : 0;
		const squareness = -Math.abs(Math.log(getAspectRatio(logo)));
		const width = logo.resolution?.width ?? 0;
		return { isIcon, squareness, width };
	};

	return [...logos]
		.filter((logo) => isAllowedLogoUrl(logo.url))
		.sort((a, b) => {
			const scoreA = scoreLogo(a);
			const scoreB = scoreLogo(b);
			return (
				scoreB.isIcon - scoreA.isIcon ||
				scoreB.squareness - scoreA.squareness ||
				scoreB.width - scoreA.width
			);
		})[0];
};

// Logo URLs come from Context.dev's own CDN. Only download from there, and
// never follow redirects, so a logo URL can't steer this server-side fetch at
// an internal address (SSRF) whose response would land in a public bucket.
const isAllowedLogoHost = (hostname: string) =>
	LOGO_CDN_HOST_SUFFIXES.some(
		(suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
	);

const isAllowedLogoUrl = (url: string) => {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "https:" && isAllowedLogoHost(parsed.hostname);
	} catch {
		return false;
	}
};

const logoDownloadFailedError = () =>
	new RecaseError({
		message: "Couldn't download a logo for that website",
		code: ErrCode.InvalidRequest,
		statusCode: 404,
	});

const logoTooLargeError = () =>
	new RecaseError({
		message: "Logo is larger than 10MB",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});

/** Reads the body but aborts as soon as it exceeds MAX_LOGO_BYTES. */
const readBodyWithLimit = async (response: Response) => {
	const reader = response.body?.getReader();
	if (!reader) throw logoDownloadFailedError();

	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		totalBytes += value.byteLength;
		if (totalBytes > MAX_LOGO_BYTES) {
			await reader.cancel();
			throw logoTooLargeError();
		}
		chunks.push(value);
	}

	const bytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
};

const downloadLogo = async (url: string) => {
	if (!isAllowedLogoUrl(url)) throw logoDownloadFailedError();

	let response: Response;
	try {
		response = await fetch(url, {
			redirect: "error",
			signal: AbortSignal.timeout(LOGO_DOWNLOAD_TIMEOUT_MS),
		});
	} catch {
		throw logoDownloadFailedError();
	}

	const contentType = response.headers.get("content-type") ?? "";
	if (!response.ok || !contentType.startsWith("image/")) {
		throw logoDownloadFailedError();
	}

	const declaredLength = Number(response.headers.get("content-length"));
	if (declaredLength > MAX_LOGO_BYTES) {
		await response.body?.cancel();
		throw logoTooLargeError();
	}

	const bytes = await readBodyWithLimit(response);
	return { bytes, contentType };
};

/**
 * Looks up the brand for a website via Context.dev, then re-hosts its logo in
 * our public assets bucket (same key as manual uploads) so org.logo never
 * depends on a third-party CDN URL.
 */
export const handleFetchOrgLogo = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: bodySchema,
	handler: async (c) => {
		const { org } = c.get("ctx");
		const { url } = c.req.valid("json");
		const domain = toDomain(url);

		const { bucket, region } = getPublicAssetsS3Config();
		if (!bucket || !region) {
			throw new InternalError({
				message: "Public asset storage not configured",
				code: "s3_not_configured",
			});
		}

		let logos: ContextDevLogo[] = [];
		try {
			const brand = await retrieveBrandByDomain({ domain });
			logos = brand?.logos ?? [];
		} catch (error) {
			if (!(error instanceof ContextDevError)) throw error;
			const isClientError = error.status >= 400 && error.status < 500;
			throw new RecaseError({
				message: isClientError
					? `Couldn't find a logo for ${domain}`
					: "Logo lookup is temporarily unavailable",
				code: ErrCode.InvalidRequest,
				statusCode: isClientError ? 404 : 502,
			});
		}

		const logo = pickBestLogo(logos);
		if (!logo) {
			throw new RecaseError({
				message: `Couldn't find a logo for ${domain}`,
				code: ErrCode.InvalidRequest,
				statusCode: 404,
			});
		}

		const { bytes, contentType } = await downloadLogo(logo.url);

		const signedUrl = await getS3PresignedPutUrl({
			bucket,
			region,
			key: getOrgLogoKey(org.id),
			credentials: getOrgLogoS3Credentials(),
		});
		const uploadResponse = await fetch(signedUrl, {
			method: "PUT",
			headers: { "Content-Type": contentType },
			body: bytes,
		});
		if (!uploadResponse.ok) {
			throw new InternalError({
				message: `Failed to store logo (${uploadResponse.status})`,
				code: "s3_upload_failed",
			});
		}

		const publicUrl = getOrgLogoPublicUrl({ bucket, region, orgId: org.id });
		return c.json({ publicUrl, domain });
	},
});
