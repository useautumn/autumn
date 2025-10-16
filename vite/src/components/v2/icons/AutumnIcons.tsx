import { useId } from "react";

export const FeatureArrowIcon = () => {
	return (
		<svg
			width="4"
			height="4"
			viewBox="0 0 4 4"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d="M2.33 2L0.58 3.35L0.58 0.65L2.33 2Z" fill="#C3C3C3" />
			<title>Arrow</title>
		</svg>
	);
};

export const IncludedUsageIcon = ({
	size = 14,
	color = "#2BAC11",
	className = "",
}: {
	size?: number;
	color?: string;
	className?: string;
}) => {
	return (
		<svg
			width="17"
			height="16"
			viewBox="0 0 17 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<title>Included Usage</title>
			<path
				d="M13.5 13.5H3.5C3.36739 13.5 3.24021 13.4473 3.14645 13.3536C3.05268 13.2598 3 13.1326 3 13V4.5L4 2.5H13L14 4.5V13C14 13.1326 13.9473 13.2598 13.8536 13.3536C13.7598 13.4473 13.6326 13.5 13.5 13.5Z"
				stroke={color}
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M3 4.5H14"
				stroke={color}
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M6.35742 9.25579L7.64314 10.5415L10.6431 7.5415"
				stroke={color}
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
};

export const PrepaidUsageIcon = () => {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			color="#0795C8"
		>
			<title>Prepaid Usage</title>
			<g clipPath="url(#clip0_632_11624)">
				<path
					d="M5.75586 8.1543C8.51728 8.1543 10.7559 7.14694 10.7559 5.9043C10.7559 4.66166 8.51728 3.6543 5.75586 3.6543C2.99444 3.6543 0.755859 4.66166 0.755859 5.9043C0.755859 7.14694 2.99444 8.1543 5.75586 8.1543Z"
					stroke="currentColor"
					strokeWidth="1.1"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M0.755859 5.9043V8.4043C0.755859 9.6468 2.99461 10.6543 5.75586 10.6543C8.51711 10.6543 10.7559 9.6468 10.7559 8.4043V5.9043"
					stroke="currentColor"
					strokeWidth="1.1"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M10.7579 6.69922C13.0404 6.90797 14.7579 7.81547 14.7579 8.90422C14.7579 10.1467 12.5191 11.1542 9.75789 11.1542C8.53289 11.1542 7.41039 10.9561 6.54102 10.6267"
					stroke="currentColor"
					strokeWidth="1.1"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M4.75586 10.6093V11.4043C4.75586 12.6468 6.99461 13.6543 9.75586 13.6543C12.5171 13.6543 14.7559 12.6468 14.7559 11.4043V8.9043"
					stroke="currentColor"
					strokeWidth="1.1"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M9.23047 3.45508L10.918 5.14258L14.8555 1.20508"
					stroke="white"
					strokeWidth="5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<path
					d="M9.50977 3.10156L11.1973 4.78906L15.1348 0.851562"
					stroke="currentColor"
					strokeWidth="1.2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</g>
			<defs>
				<clipPath id={useId()}>
					<rect width="16" height="16" fill="white" />
				</clipPath>
			</defs>
		</svg>
	);
};

export const UsageBasedIcon = ({ color = "#DE1779" }: { color?: string }) => {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Usage Based</title>
			<path
				d="M13.46 3.84009H2.54C1.96562 3.84009 1.5 4.30571 1.5 4.88009V11.1201C1.5 11.6945 1.96562 12.1601 2.54 12.1601H13.46C14.0344 12.1601 14.5 11.6945 14.5 11.1201V4.88009C14.5 4.30571 14.0344 3.84009 13.46 3.84009Z"
				stroke={color}
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M9.30078 5.91992V10.0799"
				stroke={color}
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M6.69922 5.91992V10.0799"
				stroke={color}
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M4.09961 5.91992V10.0799"
				stroke={color}
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
};

export const CoinsIcon = ({
	size = 16,
	color = "#F59E0B",
}: {
	size?: number;
	color?: string;
}) => {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			color={color}
		>
			<title>Paid</title>
			<path
				d="M6 7.5C8.76142 7.5 11 6.49264 11 5.25C11 4.00736 8.76142 3 6 3C3.23858 3 1 4.00736 1 5.25C1 6.49264 3.23858 7.5 6 7.5Z"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M1 5.25V7.75C1 8.9925 3.23875 10 6 10C8.76125 10 11 8.9925 11 7.75V5.25"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M11.0001 6.04492C13.2826 6.25367 15.0001 7.16117 15.0001 8.24992C15.0001 9.49242 12.7613 10.4999 10.0001 10.4999C8.77508 10.4999 7.65258 10.3018 6.7832 9.97242"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M5 9.955V10.75C5 11.9925 7.23875 13 10 13C12.7613 13 15 11.9925 15 10.75V8.25"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
};

export const BooleanIcon = ({
	size = 16,
	color = "#8A8A8A",
}: {
	size?: number;
	color?: string;
}) => {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Boolean</title>
			<path
				d="M8 2.84253V7.99253"
				stroke={color}
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M11.0909 3.35742C12.6411 4.36811 13.6659 6.00388 13.6659 7.99242C13.6659 9.49487 13.0691 10.9358 12.0067 11.9982C10.9443 13.0606 9.50339 13.6574 8.00094 13.6574C6.49849 13.6574 5.05757 13.0606 3.99518 11.9982C2.93278 10.9358 2.33594 9.49487 2.33594 7.99242C2.33594 6.00388 3.36079 4.36811 4.91094 3.35742"
				stroke={color}
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
};

export const ContinuousUseIcon = () => {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Allocated</title>
			<path
				d="M6 3.5V12.5"
				stroke="#9210B9"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M1.5 10C2.03043 10 2.53914 9.78929 2.91421 9.41421C3.28929 9.03914 3.5 8.53043 3.5 8C3.5 7.46957 3.28929 6.96086 2.91421 6.58579C2.53914 6.21071 2.03043 6 1.5 6V4C1.5 3.86739 1.55268 3.74021 1.64645 3.64645C1.74021 3.55268 1.86739 3.5 2 3.5H14C14.1326 3.5 14.2598 3.55268 14.3536 3.64645C14.4473 3.74021 14.5 3.86739 14.5 4V6C13.9696 6 13.4609 6.21071 13.0858 6.58579C12.7107 6.96086 12.5 7.46957 12.5 8C12.5 8.53043 12.7107 9.03914 13.0858 9.41421C13.4609 9.78929 13.9696 10 14.5 10V12C14.5 12.1326 14.4473 12.2598 14.3536 12.3536C14.2598 12.4473 14.1326 12.5 14 12.5H2C1.86739 12.5 1.74021 12.4473 1.64645 12.3536C1.55268 12.2598 1.5 12.1326 1.5 12V10Z"
				stroke="#9210B9"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
};

export const DefaultIcon = ({
	size = 16,
	color = "#666666",
}: {
	size?: number;
	color?: string;
}) => {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 15 15"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Default</title>
			<path
				d="M11.875 2.6875H3.125C2.88338 2.6875 2.6875 2.88338 2.6875 3.125V11.875C2.6875 12.1166 2.88338 12.3125 3.125 12.3125H11.875C12.1166 12.3125 12.3125 12.1166 12.3125 11.875V3.125C12.3125 2.88338 12.1166 2.6875 11.875 2.6875Z"
				stroke={color}
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle cx="7.50039" cy="7.50015" r="1.225" fill={color} />
		</svg>
	);
};

export const FreeTrialIcon = ({
	size = 15,
	color = "#666666",
}: {
	size?: number;
	color?: string;
}) => {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 15 14"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Free Trial</title>
			<path
				d="M11.875 2.1875H3.125C2.88338 2.1875 2.6875 2.38338 2.6875 2.625V11.375C2.6875 11.6166 2.88338 11.8125 3.125 11.8125H11.875C12.1166 11.8125 12.3125 11.6166 12.3125 11.375V2.625C12.3125 2.38338 12.1166 2.1875 11.875 2.1875Z"
				stroke={color}
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M7.22852 4.5V7.5H10.2285"
				stroke={color}
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
};
