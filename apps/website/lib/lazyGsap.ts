type Gsap = (typeof import("gsap"))["default"];

let promise: Promise<Gsap> | null = null;

export const getGsap = (): Promise<Gsap> => {
  if (!promise) promise = import("gsap").then((m) => m.default);
  return promise;
};
