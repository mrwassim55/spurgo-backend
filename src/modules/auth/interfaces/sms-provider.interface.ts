export interface ISmsProvider {
  sendSms(phoneNumber: string, message: string): Promise<void>;
  sendOtp(phoneNumber: string, code: string): Promise<void>;
}
