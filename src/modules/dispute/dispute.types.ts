export interface DisputeResolver {
  accountId: string;
  name: string;
  score: number;
  completedDisputes: number;
  specialization: string[];
}

export interface SuggestResolverResult {
  resolvers: DisputeResolver[];
  registryUrl: string;
}
