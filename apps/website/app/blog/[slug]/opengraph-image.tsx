import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getPostBySlug } from "@/lib/blogUtils";

export const alt = "Autumn blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0A0A0A";
const CARD = "#111114";
const LINE = "#26262c";
const ROW = "#1b1b20";
const ACCENT_SOFT = "#b495ff";
const TEXT = "#E6E6E9";
const MUTED = "#7c7c85";

const FONT_SRC_RE = /src: url\((.+?)\) format/;

async function loadGoogleFont(family: string, weight: number) {
	const url = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`;
	const css = await fetch(url, {
		headers: { "User-Agent": "Mozilla/5.0 (Windows NT 5.1)" },
	}).then((r) => r.text());
	const match = css.match(FONT_SRC_RE);
	if (!match) {
		throw new Error("font src not found");
	}
	return fetch(match[1]).then((r) => r.arrayBuffer());
}

async function logoDataUri() {
	const file = await readFile(
		path.join(process.cwd(), "public/images/navbar/autumnlogo.svg"),
	);
	return `data:image/svg+xml;base64,${file.toString("base64")}`;
}

async function bgDataUri() {
	const file = await readFile(
		path.join(process.cwd(), "public/images/blog/og-bg-texture.png"),
	);
	return `data:image/png;base64,${file.toString("base64")}`;
}

function Table({
	name,
	cols,
	rows,
	width,
	accentCells = [],
}: {
	name: string;
	cols: string[];
	rows: string[][];
	width: number;
	accentCells?: string[];
}) {
	const colWidth = width / cols.length;
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width,
				borderRadius: 10,
				border: `1px solid ${LINE}`,
				background: CARD,
				overflow: "hidden",
				fontFamily: "Geist Mono",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					height: 38,
					padding: "0 16px",
					borderBottom: `1px solid ${LINE}`,
					color: "#fff",
					fontSize: 13,
					letterSpacing: 1,
				}}
			>
				{name.toUpperCase()}
			</div>
			{[cols, ...rows].map((row, rowIndex) => (
				<div
					key={row.join()}
					style={{
						display: "flex",
						height: 36,
						borderTop: rowIndex === 0 ? "none" : `1px solid ${ROW}`,
					}}
				>
					{row.map((cell) => (
						<div
							key={cell}
							style={{
								display: "flex",
								alignItems: "center",
								width: colWidth,
								padding: "0 16px",
								fontSize: 14,
								color:
									rowIndex === 0
										? MUTED
										: accentCells.includes(cell)
											? ACCENT_SOFT
											: TEXT,
							}}
						>
							{cell}
						</div>
					))}
				</div>
			))}
		</div>
	);
}

export default async function OgImage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const post = getPostBySlug({ slug });
	const title = post?.title ?? "Autumn";

	const [logo, bg, fonts] = await Promise.all([
		logoDataUri(),
		bgDataUri(),
		Promise.all([
			loadGoogleFont("Geist", 400),
			loadGoogleFont("Geist+Mono", 400),
		])
			.then(([regular, mono]) => [
				{ name: "Geist", data: regular, weight: 400 as const },
				{ name: "Geist Mono", data: mono, weight: 400 as const },
			])
			.catch(() => undefined),
	]);

	return new ImageResponse(
		<div
			style={{
				position: "relative",
				width: "100%",
				height: "100%",
				display: "flex",
				background: BG,
				fontFamily: "Geist",
				overflow: "hidden",
			}}
		>
			{/* bloom neon background texture, darkened */}
			{/** biome-ignore lint/performance/noImgElement: satori only supports <img> */}
			<img
				alt=""
				height={630}
				src={bg}
				style={{ position: "absolute", inset: 0, objectFit: "cover" }}
				width={1200}
			/>
			<div
				style={{
					position: "absolute",
					inset: 0,
					background:
						"linear-gradient(90deg, rgba(10,10,10,0.82) 0%, rgba(10,10,10,0.5) 48%, rgba(10,10,10,0.2) 100%)",
				}}
			/>

			{/* tables (right) */}
			<div
				style={{
					position: "absolute",
					top: 128,
					right: 64,
					display: "flex",
					flexDirection: "column",
					alignItems: "flex-end",
				}}
			>
				<Table
					accentCells={["pro_v2"]}
					cols={["id", "plan_id"]}
					name="customers"
					rows={[
						["cus_001", "pro_v2"],
						["cus_002", "acme_custom"],
					]}
					width={372}
				/>
				<div style={{ display: "flex", height: 36 }} />
				<Table
					accentCells={["pro_v2", "400"]}
					cols={["id", "price", "credits"]}
					name="plans"
					rows={[
						["free", "$0", "50"],
						["pro_v1", "$20", "200"],
						["pro_v2", "$40", "400"],
					]}
					width={372}
				/>
			</div>

			{/* left rail: logo, headline, footer */}
			{/** biome-ignore lint/performance/noImgElement: satori only supports <img> */}
			<img
				alt="Autumn"
				height={37}
				src={logo}
				style={{ position: "absolute", top: 56, left: 64 }}
				width={150}
			/>
			<div
				style={{
					position: "absolute",
					left: 64,
					top: 232,
					width: 600,
					display: "flex",
					fontSize: 60,
					fontWeight: 400,
					lineHeight: 1.0,
					letterSpacing: -3,
					color: "#fff",
				}}
			>
				{title}
			</div>
			<div
				style={{
					position: "absolute",
					left: 64,
					bottom: 52,
					display: "flex",
					fontFamily: "Geist Mono",
					fontSize: 17,
					color: MUTED,
				}}
			>
				useautumn.com
			</div>
		</div>,
		{ ...size, ...(fonts ? { fonts } : {}) },
	);
}
