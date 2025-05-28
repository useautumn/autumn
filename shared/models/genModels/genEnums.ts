export enum APIVersion {
  v1 = 1,
  v1_1 = 1.1,
  v1_2 = 1.2,
}

export enum AppEnv {
  Sandbox = "sandbox",
  Live = "live",
}

export enum Duration {
  Minute = "minute",
  Hour = "hour",
  Day = "day",
  Week = "week",
  Month = "month",
  Year = "year",
  Lifetime = "lifetime",
}

export enum ProcessorType {
  Stripe = "stripe",
}

export enum AuthType {
  SecretKey = "secret_key",
  PublicKey = "public_key",
  Frontend = "frontend",
}
