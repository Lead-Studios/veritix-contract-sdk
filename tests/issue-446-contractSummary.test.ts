/**
 * @file tests/issue-446-contractSummary.test.ts
 * Coverage for VeriTixClient.contractSummary() — issue #446.
 *
 * `contractSummary()` does not exist on `VeriTixClient` on `main` (confirmed
 * via repo-wide search). Its feature PR (#361) was closed unmerged. These
 * cases are marked `.todo` so they show up in test output as pending
 * coverage rather than silently passing or calling an undefined method.
 */
describe('VeriTixClient.contractSummary()', () => {
  it.todo('returns all expected fields, including name/symbol/totalSupply/escrowCount/isPaused');
  it.todo('does not let one failed field prevent the others from being populated');
  it.todo('throws if not connected');
});
