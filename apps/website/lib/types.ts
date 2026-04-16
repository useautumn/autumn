import type {
	ComponentPropsWithoutRef,
	ComponentType,
	CSSProperties,
	PropsWithChildren,
	RefAttributes,
} from "react";

export type PageStyle = CSSProperties & {
	"--page-pad"?: string;
};

export type SvgIconProps = ComponentPropsWithoutRef<"svg">;
export type ImgProps = ComponentPropsWithoutRef<"img">;

export type PixelIconComponent = ComponentType<
	SvgIconProps & Partial<RefAttributes<SVGSVGElement>>
>;

export type PixelAnimationHandle = {
	play: () => void;
	reverse: () => void;
};

export type PixelHoverHandle = {
	restart: () => void;
	reverse: () => void;
};

export type LayoutProps = PropsWithChildren;

export type BlogParams = Promise<{
	slug: string;
}>;
