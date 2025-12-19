import type React from "react";
import { useMemo } from "react";

export interface JsonField {
	label: string;
	value: string;
	type?: "string" | "number" | "success" | "info";
}

interface DataFlowCardProps {
	sourceImage: string;
	sourceImageAlt?: string;
	jsonFields: JsonField[];
	destinationLabel?: string;
}

const CHAR_WIDTH = 6.5; // Approximate width per character in monospace
const LINE_HEIGHT = 16;
const PADDING_X = 16;
const PADDING_Y = 12;
const FONT_SIZE = 11;

export const DataFlowCard: React.FC<DataFlowCardProps> = ({
	sourceImage,
	sourceImageAlt = "Source",
	jsonFields,
	destinationLabel = "Layers",
}) => {
	const getValueColor = (type?: string) => {
		switch (type) {
			case "success":
			case "number":
				return "#3EAE20";
			case "info":
				return "#2B9DF6";
			default:
				return "#8C99AD";
		}
	};

	const formatValue = (field: JsonField, isLast: boolean) => {
		const comma = isLast ? "" : ",";
		if (field.type === "string") {
			return `"${field.value}"${comma}`;
		}
		return `${field.value}${comma}`;
	};

	// Calculate dimensions based on content
	const { jsonBoxWidth, jsonBoxHeight } = useMemo(() => {
		let maxLineWidth = 0;

		for (const field of jsonFields) {
			// Each line: "label":    "value",  (4 spaces between : and value)
			const lineText = `"${field.label}": ${formatValue(field, false)}`;
			maxLineWidth = Math.max(maxLineWidth, lineText.length * CHAR_WIDTH);
		}

		const boxWidth = maxLineWidth + PADDING_X * 2;
		const boxHeight = PADDING_Y * 2 + jsonFields.length * LINE_HEIGHT + 4;

		return {
			jsonBoxWidth: boxWidth,
			jsonBoxHeight: boxHeight,
		};
	}, [jsonFields]);

	// Layout calculations
	const sourceBoxSize = 40;
	const destBoxSize = 40;
	const connectorLength = 40;
	const glowPadding = 52; // Space for glow effect

	const sourceBoxX = glowPadding;
	const jsonBoxY = 5;
	const jsonCenterY = jsonBoxY + jsonBoxHeight / 2;

	const sourceBoxY = jsonCenterY - sourceBoxSize / 2;
	const sourceCenterY = sourceBoxY + sourceBoxSize / 2;

	const jsonBoxX = sourceBoxX + sourceBoxSize + connectorLength;

	const destBoxX = jsonBoxX + jsonBoxWidth + connectorLength;
	const destBoxY = jsonCenterY - destBoxSize / 2;
	const destCenterY = destBoxY + destBoxSize / 2;

	const totalWidth = destBoxX + destBoxSize + glowPadding;
	const totalHeight = Math.max(
		sourceBoxY + sourceBoxSize + glowPadding,
		jsonBoxHeight + 10,
		destBoxY + destBoxSize + glowPadding,
	);

	// Connector line positions
	const leftLineStart = sourceBoxX + sourceBoxSize;
	const leftLineEnd = jsonBoxX;
	const rightLineStart = jsonBoxX + jsonBoxWidth;
	const rightLineEnd = destBoxX;

	return (
		<svg
			width={totalWidth}
			height={totalHeight}
			viewBox={`0 0 ${totalWidth} ${totalHeight}`}
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Data Flow Card</title>
			{/* Filters */}
			<defs>
				<filter
					id="glow-left"
					x={sourceBoxX - glowPadding}
					y={sourceBoxY - glowPadding}
					width={sourceBoxSize + glowPadding * 2}
					height={sourceBoxSize + glowPadding * 2}
					filterUnits="userSpaceOnUse"
					colorInterpolationFilters="sRGB"
				>
					<feFlood floodOpacity="0" result="BackgroundImageFix" />
					<feColorMatrix
						in="SourceAlpha"
						type="matrix"
						values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
						result="hardAlpha"
					/>
					<feOffset />
					<feGaussianBlur stdDeviation="25.5" />
					<feComposite in2="hardAlpha" operator="out" />
					<feColorMatrix
						type="matrix"
						values="0 0 0 0 0.32 0 0 0 0 0 0 0 0 0 1 0 0 0 0.84 0"
					/>
					<feBlend
						mode="normal"
						in2="BackgroundImageFix"
						result="effect1_dropShadow"
					/>
					<feBlend
						mode="normal"
						in="SourceGraphic"
						in2="effect1_dropShadow"
						result="shape"
					/>
				</filter>
				<filter
					id="glow-right"
					x={destBoxX - glowPadding}
					y={destBoxY - glowPadding}
					width={destBoxSize + glowPadding * 2}
					height={destBoxSize + glowPadding * 2}
					filterUnits="userSpaceOnUse"
					colorInterpolationFilters="sRGB"
				>
					<feFlood floodOpacity="0" result="BackgroundImageFix" />
					<feColorMatrix
						in="SourceAlpha"
						type="matrix"
						values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
						result="hardAlpha"
					/>
					<feOffset />
					<feGaussianBlur stdDeviation="25.5" />
					<feComposite in2="hardAlpha" operator="out" />
					<feColorMatrix
						type="matrix"
						values="0 0 0 0 0 0 0 0 0 0.16 0 0 0 0 1 0 0 0 0.84 0"
					/>
					<feBlend
						mode="normal"
						in2="BackgroundImageFix"
						result="effect1_dropShadow"
					/>
					<feBlend
						mode="normal"
						in="SourceGraphic"
						in2="effect1_dropShadow"
						result="shape"
					/>
				</filter>
				<clipPath id="sourceImageClip">
					<rect
						x={sourceBoxX}
						y={sourceBoxY}
						width={sourceBoxSize}
						height={sourceBoxSize}
						rx="5"
					/>
				</clipPath>
			</defs>

			{/* Left connector line */}
			<line
				x1={leftLineStart}
				y1={sourceCenterY}
				x2={leftLineEnd}
				y2={sourceCenterY}
				stroke="#ECEEF1"
				strokeOpacity="0.3"
				strokeLinecap="round"
			/>

			{/* Source image box with glow */}
			<g filter="url(#glow-left)">
				<rect
					x={sourceBoxX}
					y={sourceBoxY}
					width={sourceBoxSize}
					height={sourceBoxSize}
					rx="5"
					fill="#1a1a2e"
					stroke="#5017B7"
				/>
				<image
					href={sourceImage}
					x={sourceBoxX + 4}
					y={sourceBoxY + 4}
					width={sourceBoxSize - 8}
					height={sourceBoxSize - 8}
					clipPath="url(#sourceImageClip)"
					preserveAspectRatio="xMidYMid slice"
				/>
			</g>

			{/* Center JSON box */}
			<rect
				x={jsonBoxX}
				y={jsonBoxY}
				width={jsonBoxWidth}
				height={jsonBoxHeight}
				rx="8"
				stroke="#2B3039"
				fill="none"
			/>

			{/* JSON content */}
			{/* <text
				x={jsonBoxX + PADDING_X}
				y={jsonBoxY + PADDING_Y + LINE_HEIGHT}
				fill="#C9CED8"
				fontSize={FONT_SIZE}
				fontFamily="monospace"
			>
				{"{"}
			</text> */}

			{jsonFields.map((field, index) => {
				const yPos = jsonBoxY + PADDING_Y + LINE_HEIGHT * (index + 1);
				const labelX = jsonBoxX + PADDING_X;
				const labelText = `"${field.label}":`;
				const valueX = labelX + labelText.length * CHAR_WIDTH + CHAR_WIDTH; // 1 space gap
				const isLast = index === jsonFields.length - 1;

				return (
					<g key={index}>
						<text
							x={labelX}
							y={yPos}
							fill="#C9CED8"
							fontSize={FONT_SIZE}
							fontFamily="monospace"
						>
							{labelText}
						</text>
						<text
							x={valueX}
							y={yPos}
							fill={getValueColor(field.type)}
							fontSize={FONT_SIZE}
							fontFamily="monospace"
						>
							{formatValue(field, isLast)}
						</text>
					</g>
				);
			})}

			{/* <text
				x={jsonBoxX + PADDING_X}
				y={jsonBoxY + PADDING_Y + LINE_HEIGHT * (jsonFields.length + 2)}
				fill="#C9CED8"
				fontSize={FONT_SIZE}
				fontFamily="monospace"
			>
				{"}"}
			</text> */}

			{/* Right connector line with arrow */}
			<line
				x1={rightLineStart}
				y1={destCenterY}
				x2={rightLineEnd - 8}
				y2={destCenterY}
				stroke="#ECEEF1"
				strokeOpacity="0.3"
				strokeLinecap="round"
			/>
			{/* Arrow head */}
			<path
				d={`M${rightLineEnd - 8} ${destCenterY - 4} L${rightLineEnd} ${destCenterY} L${rightLineEnd - 8} ${destCenterY + 4}`}
				stroke="#ECEEF1"
				strokeOpacity="0.3"
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
			/>

			{/* Destination box (Layers icon) with glow */}
			<g filter="url(#glow-right)">
				<rect
					x={destBoxX}
					y={destBoxY}
					width={destBoxSize}
					height={destBoxSize}
					rx="5"
					fill="#062059"
					stroke="#0F3D99"
				/>
				{/* Layers icon - centered in box */}
				<g
					transform={`translate(${destBoxX + destBoxSize / 2 - 9.5}, ${destBoxY + destBoxSize / 2 - 10})`}
				>
					<path
						fillRule="evenodd"
						clipRule="evenodd"
						d="M0 8C0 7.64 0.19 7.31 0.5 7.12L8.2 2.5C8.52 2.31 8.9 2.2 9.28 2.2C9.66 2.2 10.04 2.31 10.36 2.5L18.06 7.12C18.37 7.31 18.56 7.64 18.56 8C18.56 8.36 18.37 8.69 18.06 8.88L10.36 13.5C10.04 13.69 9.66 13.8 9.28 13.8C8.9 13.8 8.52 13.69 8.2 13.5L0.5 8.88C0.19 8.69 0 8.36 0 8ZM9.16 11.91L2.65 8L9.16 4.1C9.2 4.07 9.24 4.06 9.28 4.06C9.33 4.06 9.37 4.07 9.41 4.1L15.92 8L9.41 11.91C9.37 11.93 9.33 11.94 9.28 11.94C9.24 11.94 9.2 11.93 9.16 11.91Z"
						fill="#2B9DF6"
					/>
					<path
						d="M1.67 12.44C1.24 12.16 0.67 12.28 0.39 12.71C0.11 13.14 0.24 13.72 0.67 14L7.77 18.59C8.2 18.87 8.7 19.01 9.22 19.01H9.35C9.86 19.01 10.37 18.87 10.8 18.59L17.9 14C18.33 13.72 18.45 13.14 18.18 12.71C17.9 12.28 17.32 12.16 16.89 12.44L9.79 17.03C9.66 17.11 9.51 17.16 9.35 17.16H9.22C9.06 17.16 8.91 17.11 8.78 17.03L1.67 12.44Z"
						fill="#2B9DF6"
					/>
				</g>
			</g>
		</svg>
	);
};

export default DataFlowCard;
