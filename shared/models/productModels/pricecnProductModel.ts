export interface PricecnProduct {
  name: string;
  description?: string;

  price: {
    primaryText: string;
    secondaryText?: string;
  };

  everythingFrom?: string;
  buttonText?: string;
  recommendText?: string;

  items: {
    primaryText: string;
    secondaryText?: string;
  }[];
}
