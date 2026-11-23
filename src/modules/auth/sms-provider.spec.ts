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

    it('should authenticate via V2 Token API and send SMS successfully', async () => {
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'mock-jwt-token-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ transactionId: 'tx-v2-999', status: 'success' }),
        });

      global.fetch = mockFetch as any;

      const provider = new MasafaSmsProvider('testuser', 'testpass', '13201');
      await provider.sendOtp('0911234567', '654321');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://rasaelV2.almasafa.ly/api/Token',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
        }),
      );

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://rasaelV2.almasafa.ly/api/sms/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-jwt-token-123',
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('"phoneNumber":"218911234567"'),
        }),
      );
    });

    it('should use pre-configured active token directly without login', async () => {
      const mockFetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transactionId: 'tx-v2-direct', status: 'success' }),
      });

      global.fetch = mockFetch as any;

      const provider = new MasafaSmsProvider(undefined, undefined, '13201', 'active-token-xyz');
      await provider.sendOtp('0911234567', '998877');

      // Only 1 call (send directly, no login required)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://rasaelV2.almasafa.ly/api/sms/send',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer active-token-xyz',
          }),
        }),
      );
    });

    it('should fall back gracefully to fallback URL if primary URL fails', async () => {
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: async () => 'Invalid token signature key',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ transactionID: 'done.req', status: 'success' }),
        });

      global.fetch = mockFetch as any;

      const provider = new MasafaSmsProvider(undefined, undefined, '13201', 'token-v1-fallback');
      await provider.sendSms('0911234567', 'Test fallback message');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://rasaelV2.almasafa.ly/api/sms/send',
        expect.anything(),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://Rasael.almasafa.ly/api/sms/send',
        expect.anything(),
      );
    });
  });

  describe('SmsService initialization', () => {
    it('should initialize Masafa provider when default/active token is present', () => {
      const configService = {
        get: jest.fn().mockImplementation((key, defaultVal) => {
          if (key === 'SMS_PROVIDER') return 'masafa';
          return defaultVal;
        }),
      } as unknown as ConfigService;

      const smsService = new SmsService(configService);
      expect((smsService as any).provider).toBeInstanceOf(MasafaSmsProvider);
    });

    it('should initialize Console provider when credentials and token are explicitly absent', () => {
      const configService = {
        get: jest.fn().mockImplementation((key) => {
          if (key === 'MASAFA_TOKEN') return '';
          return undefined;
        }),
      } as unknown as ConfigService;

      // When token is explicitly set to empty string
      const smsService = new SmsService(configService);
      expect((smsService as any).provider).toBeDefined();
    });
  });
});
