export const isValidNumber = (value: any) => {
  let number = parseFloat(value);
  return !isNaN(number) && isFinite(number);
};

export const numberWithCommas = (x: number) => {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
