/** Shape of a single model from the models.dev API */
export interface ModelsDevModel {
  id: string;
  name: string;
  cost: {
    input: number;
    output: number;
  };
}

/** Shape of a provider from the models.dev API */
export interface ModelsDevProvider {
  id: string;
  name: string;
  models: Record<string, ModelsDevModel>;
}
