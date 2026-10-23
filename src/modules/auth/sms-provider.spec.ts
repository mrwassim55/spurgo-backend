import { MasafaSmsProvider } from './providers/masafa-sms.provider';
import { ConsoleSmsProvider } from './providers/console-sms.provider';
import { SmsService } from './sms.service';
import { ConfigService } from '@nestjs/config';

describe('MasafaSmsProvider & SmsService', () => {
  let originalFetch: any;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('MasafaSmsProvider', () => {
    it('should format Libyan phone numbers correctly', async () => {
      const provider = new MasafaSmsProvider('testuser', 'testpass');
      const formatPhone = (provider as any).formatPhoneNumber.bind(provider);

      expect(formatPhone('0911234567')).toBe('218911234567');
      expect(formatPhone('921234567')).toBe('218921234567');
      expect(formatPhone('+218911234567')).toBe('218911234567');
      expect(formatPhone('218911234567')).toBe('218911234567');
    });

    it('should authenticate and send SMS successfully', async () => {
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'mock-jwt-token-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ transactionID: 'tx-999', status: 'success' }),
        });

      global.fetch = mockFetch as any;

      const provider = new MasafaSmsProvider('testuser', 'testpass', '13201');
      await provider.sendOtp('0911234567', '654321');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://Rasael.almasafa.ly/api/MasafaRasaelLogin',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
        }),
      );

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://Rasael.almasafa.ly/api/sms/Send',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer mock-jwt-token-123',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phoneNumber: '218911234567',
            message: 'رمز التحقق الخاص بك في سبورجو هو: 654321',
            senderID: '13201',
          }),
        }),
      );
    });
  });

  describe('SmsService initialization', () => {
    it('should initialize Masafa provider when credentials are present', () => {
      const configService = {
        get: jest.fn().mockImplementation((key, defaultVal) => {
          if (key === 'SMS_PROVIDER') return 'masafa';
          if (key === 'MASAFA_USERNAME') return 'myuser';
          if (key === 'MASAFA_PASSWORD') return 'mypass';
          return defaultVal;
        }),
      } as unknown as ConfigService;

      const smsService = new SmsService(configService);
      expect((smsService as any).provider).toBeInstanceOf(MasafaSmsProvider);
    });

    it('should initialize Console provider when credentials are missing', () => {
      const configService = {
        get: jest.fn().mockImplementation((key, defaultVal) => {
          return defaultVal;
        }),
      } as unknown as ConfigService;

      const smsService = new SmsService(configService);
      expect((smsService as any).provider).toBeInstanceOf(ConsoleSmsProvider);
    });
  });
});
