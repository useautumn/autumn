/** biome-ignore-all lint/a11y/noSvgWithoutTitle: needed */
import { useId } from "react";

const FeatureArrowIcon = () => {
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

const PrepaidUsageIcon = () => {
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

export const UsageBasedIcon = ({
	color = "#DE1779",
	className = "",
}: {
	color?: string;
	className?: string;
}) => {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			color={className ? undefined : color}
		>
			<title>Usage Based</title>
			<path
				d="M13.46 3.84009H2.54C1.96562 3.84009 1.5 4.30571 1.5 4.88009V11.1201C1.5 11.6945 1.96562 12.1601 2.54 12.1601H13.46C14.0344 12.1601 14.5 11.6945 14.5 11.1201V4.88009C14.5 4.30571 14.0344 3.84009 13.46 3.84009Z"
				stroke={className ? "currentColor" : color}
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M9.30078 5.91992V10.0799"
				stroke={className ? "currentColor" : color}
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M6.69922 5.91992V10.0799"
				stroke={className ? "currentColor" : color}
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M4.09961 5.91992V10.0799"
				stroke={className ? "currentColor" : color}
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
	className = "",
}: {
	size?: number;
	color?: string;
	className?: string;
}) => {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			color={className ? undefined : color}
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
	className = "",
}: {
	size?: number;
	color?: string;
	className?: string;
}) => {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			color={className ? undefined : color}
		>
			<title>Boolean</title>
			<path
				d="M8 2.84253V7.99253"
				stroke={className ? "currentColor" : color}
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M11.0909 3.35742C12.6411 4.36811 13.6659 6.00388 13.6659 7.99242C13.6659 9.49487 13.0691 10.9358 12.0067 11.9982C10.9443 13.0606 9.50339 13.6574 8.00094 13.6574C6.49849 13.6574 5.05757 13.0606 3.99518 11.9982C2.93278 10.9358 2.33594 9.49487 2.33594 7.99242C2.33594 6.00388 3.36079 4.36811 4.91094 3.35742"
				stroke={className ? "currentColor" : color}
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
};

export const ContinuousUseIcon = ({
	color = "#9210B9",
	className = "",
}: {
	color?: string;
	className?: string;
}) => {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			color={className ? undefined : color}
		>
			<title>Non-consumable</title>
			<path
				d="M6 3.5V12.5"
				stroke={className ? "currentColor" : color}
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M1.5 10C2.03043 10 2.53914 9.78929 2.91421 9.41421C3.28929 9.03914 3.5 8.53043 3.5 8C3.5 7.46957 3.28929 6.96086 2.91421 6.58579C2.53914 6.21071 2.03043 6 1.5 6V4C1.5 3.86739 1.55268 3.74021 1.64645 3.64645C1.74021 3.55268 1.86739 3.5 2 3.5H14C14.1326 3.5 14.2598 3.55268 14.3536 3.64645C14.4473 3.74021 14.5 3.86739 14.5 4V6C13.9696 6 13.4609 6.21071 13.0858 6.58579C12.7107 6.96086 12.5 7.46957 12.5 8C12.5 8.53043 12.7107 9.03914 13.0858 9.41421C13.4609 9.78929 13.9696 10 14.5 10V12C14.5 12.1326 14.4473 12.2598 14.3536 12.3536C14.2598 12.4473 14.1326 12.5 14 12.5H2C1.86739 12.5 1.74021 12.4473 1.64645 12.3536C1.55268 12.2598 1.5 12.1326 1.5 12V10Z"
				stroke={className ? "currentColor" : color}
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
	hideTitle = false,
}: {
	size?: number;
	color?: string;
	hideTitle?: boolean;
}) => {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 15 15"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			{!hideTitle && <title>Default</title>}
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

const FreeTrialIcon = ({
	size = 15,
	color = "#666666",
	hideTitle = false,
}: {
	size?: number;
	color?: string;
	hideTitle?: boolean;
}) => {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 15 14"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			{!hideTitle && <title>Free Trial</title>}
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

export const RevenueCatIcon = ({
	size = 32,
	color = "currentColor",
}: {
	size?: number;
	color?: string;
}) => {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-label="RevenueCat"
		>
			<path
				d="M4.45312 5.14566C5.16339 4.97382 6.26308 4.875 7.25602 4.875C9.93964 4.875 11.5462 5.8091 11.5462 8.18654C11.5462 9.64435 10.9564 10.6061 10.0315 11.1299L12.2702 14.9506C12.0961 15.0765 11.7204 15.1489 11.1968 15.1489C10.607 15.1489 10.2181 15.0784 9.93666 14.9506L8.07303 11.6391H7.85834C7.39636 11.6393 6.9349 11.6063 6.47717 11.5403V14.9651C6.28932 15.0784 5.95416 15.1489 5.47171 15.1489C5.00297 15.1489 4.6541 15.0778 4.45312 14.9651V5.14566ZM6.45202 9.74286C6.83305 9.80919 7.21861 9.84224 7.60478 9.84169C8.77126 9.84169 9.48212 9.40107 9.48212 8.29953C9.48212 7.16652 8.73131 6.70073 7.39069 6.70073C7.07607 6.69926 6.76194 6.72727 6.45202 6.78445V9.74286Z"
				fill={color}
			></path>
			<path
				d="M20.0873 15.4333C20.0873 17.134 19.2255 17.6013 18.5768 17.9154C16.9205 18.7181 14.2672 17.7844 11.4471 17.5002C8.89369 17.1663 6.36123 16.9464 5.96759 17.519C5.81962 17.664 5.78815 18.1312 5.96759 18.3217C6.49705 18.8836 7.87784 18.4919 8.8556 18.3147C9.15896 18.2669 9.46559 18.3796 9.65998 18.6104C9.85436 18.8411 9.90698 19.1549 9.798 19.4334C9.68902 19.712 9.43501 19.913 9.13165 19.9608C8.68965 20.028 8.24297 20.062 7.79558 20.0625C6.84321 20.0625 5.64571 19.8982 4.96608 19.1752C4.62765 18.8156 4.28093 18.1772 4.54815 17.1781C5.05663 15.2847 8.10033 15.7524 11.6266 16.1078C14.0817 16.355 16.7452 17.1781 17.8094 16.4223C18.0807 16.2297 18.5867 15.7979 18.314 15.4333C18.0412 15.0688 17.5947 15.2664 17.008 15.2664C14.0696 15.2664 12.3393 13.3735 12.3393 10.2148C12.3397 7.84182 13.3207 6.18242 14.9197 5.39484C15.6145 5.05261 16.426 4.875 17.3244 4.875C18.1074 4.875 18.9033 5.01239 19.4114 5.31403C19.7272 5.76711 19.8646 6.57678 19.7956 7.18129C19.1366 6.86561 18.5325 6.70074 17.7501 6.70074C15.814 6.70074 14.4819 7.68933 14.4819 10.0774C14.4819 12.4656 15.7999 13.4132 17.6536 13.4132C18.1813 13.4079 18.8953 13.3439 19.7956 13.2212C19.9901 13.9452 20.0873 14.6826 20.0873 15.4333Z"
				fill={color}
			></path>
		</svg>
	);
};
