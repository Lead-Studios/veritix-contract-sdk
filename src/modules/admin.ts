export class AdminModule {
  private adminAddress: string;

  constructor(adminAddress: string) {
    this.adminAddress = adminAddress;
  }

  public assertAdmin(callerAddress: string): void {
    if (callerAddress !== this.adminAddress) {
      throw new Error('Caller is not authorized admin');
    }
  }
}
