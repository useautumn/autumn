import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ElementType,
} from "react";

export type IconProps = ComponentPropsWithoutRef<"svg">;
export type IconComponent = ElementType<IconProps>;
export type ImageProps = ComponentPropsWithoutRef<"img">;
export type PageStyle = CSSProperties & { "--page-pad": string };
export interface FeatureItem {
  description: string;
  Icon: IconComponent;
  title: string;
}
export interface FaqItem {
  answer: string;
  id: number;
  question: string;
}
export interface IconAnimationHandle {
  play: () => void;
  reverse: () => void;
}
export interface NavIconHandle {
  restart: () => void;
  reverse: () => void;
}
