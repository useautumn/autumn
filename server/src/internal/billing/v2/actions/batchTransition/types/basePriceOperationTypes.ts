import type { Price } from "@autumn/shared";

export type ReplaceBasePriceOperation = {
	type: "replace";
	fromPriceIds: string[];
	fromPrice: Price;
	toPrice: Price;
};

export type AddBasePriceOperation = {
	type: "add";
	existingBasePriceIds: string[];
	toPrice: Price;
};

export type RemoveBasePriceOperation = {
	type: "remove";
	fromPriceIds: string[];
	fromPrice: Price;
};

export type BasePriceOperation =
	| ReplaceBasePriceOperation
	| AddBasePriceOperation
	| RemoveBasePriceOperation;
