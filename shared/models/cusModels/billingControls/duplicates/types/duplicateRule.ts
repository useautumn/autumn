export type DuplicateRule<TControl> = {
	identityOf: (control: TControl) => string | undefined;
	field: keyof TControl & string;
	message: string;
};
