export const isValidNumber = (value: any) => {
	const number = parseFloat(value);
	return !Number.isNaN(number) && Number.isFinite(number);
};

export const numberWithCommas = (x: number) => {
	return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
