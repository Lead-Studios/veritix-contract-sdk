/**
 * @file tests/issue-445-batchRead.test.ts
 * Coverage for VeriTixClient.batchRead() — issue #445.
 *
 * `batchRead()` does not exist on `VeriTixClient` on `main` (confirmed via
 * repo-wide search). Its feature PR (#360) was closed unmerged. These cases
 * are marked `.todo` so they show up in test output as pending coverage
 * rather than silently passing or calling an undefined method.
 */
describe('VeriTixClient.batchRead()', () => {
  it.todo('executes all operations in parallel and returns results in input order');
  it.todo('rejects with the first error when any operation fails');
  it.todo('returns an empty array for an empty operations list');
});
