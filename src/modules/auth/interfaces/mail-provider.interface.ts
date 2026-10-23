export interface IMailProvider {
  sendOtp(to: string, code: string): Promise<void>;
  sendPasswordReset(to: string, code: string): Promise<void>;
}
