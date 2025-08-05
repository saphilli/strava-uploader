import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutlookService } from '../services/outlookService';
import { BaseEmailService } from '../services/emailService';
import { EmailConfig, EmailProvider, EmailFilter } from '../types/email';
import Imap from 'imap';

// Mock dependencies
vi.mock('imap');

const mockImap = vi.mocked(Imap);

describe.skip('OutlookService', () => {
  const testDomain = 'mywellness.com';
  
  let outlookService: OutlookService;
  let outlookConfig: EmailConfig;
  let mockImapInstance: {
    once: (event: string, callback: (error?: Error) => void) => void;
    connect: () => void;
    end: () => void;
    openBox: (box: string, readOnly: boolean, callback: (err?: Error) => void) => void;
    search: (criteria: unknown, callback: (err?: Error, results?: unknown[]) => void) => void;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    outlookConfig = {
      provider: EmailProvider.Outlook,
      email: 'test@outlook.com',
      domain: testDomain,
      auth: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        refreshToken: 'test-refresh-token'
      }
    };
    
    // Mock IMAP instance
    mockImapInstance = {
      once: vi.fn(),
      connect: vi.fn(),
      end: vi.fn(),
      openBox: vi.fn(),
      search: vi.fn()
    };
    
    mockImap.mockImplementation(() => mockImapInstance as any);
    
    outlookService = new OutlookService(outlookConfig);
  });

  describe('constructor', () => {
    it('should create OutlookService instance', () => {
      expect(outlookService).toBeInstanceOf(OutlookService);
      expect(outlookService).toBeInstanceOf(BaseEmailService);
    });
  });

  describe('connect', () => {
    it('should connect to Outlook successfully', async () => {
      // Mock IMAP ready event
      mockImapInstance.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
      });
      
      const connectPromise = outlookService.connect();
      
      // Trigger ready event
      const readyCallback = mockImapInstance.once.mock.calls.find((call: [string, () => void]) => call[0] === 'ready')?.[1];
      if (readyCallback) readyCallback();
      
      await connectPromise;
      
      expect(mockImapInstance.connect).toHaveBeenCalled();
    });

    it('should handle Outlook connection error', async () => {
      const error = new Error('Connection failed');
      
      mockImapInstance.once.mockImplementation((event: string, callback: (err?: Error) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(error), 0);
        }
      });
      
      const connectPromise = outlookService.connect();
      
      // Trigger error event
      const errorCallback = mockImapInstance.once.mock.calls.find((call: [string, (error?: Error) => void]) => call[0] === 'error')?.[1];
      if (errorCallback) errorCallback(error);
      
      await expect(connectPromise).rejects.toThrow('Connection failed');
    });

    it('should throw error for Outlook without auth config', async () => {
      const configWithoutAuth: EmailConfig = {
        provider: EmailProvider.Outlook,
        email: 'test@outlook.com',
        domain: testDomain
      };
      
      const serviceWithoutAuth = new OutlookService(configWithoutAuth);
      
      await expect(serviceWithoutAuth.connect()).rejects.toThrow(
        'OAuth configuration is required for Outlook'
      );
    });
  });

  describe('getMessages', () => {
    it('should fetch Outlook messages successfully', async () => {
      // Mock IMAP methods
      mockImapInstance.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') setTimeout(callback, 0);
      });
      mockImapInstance.openBox.mockImplementation((box: string, readOnly: boolean, callback: (err?: Error) => void) => {
        setTimeout(() => callback(), 0);
      });
      mockImapInstance.search.mockImplementation((criteria: unknown, callback: (err?: Error, results?: unknown[]) => void) => {
        setTimeout(() => callback(undefined, []), 0);
      });
      
      const connectPromise = outlookService.connect();
      
      // Trigger ready event
      const readyCallback = mockImapInstance.once.mock.calls.find((call: [string, () => void]) => call[0] === 'ready')?.[1];
      if (readyCallback) readyCallback();
      
      await connectPromise;
      
      const filter: EmailFilter = { fromDomain: testDomain };
      const result = await outlookService.getMessages(filter);
      
      expect(result).toEqual([]);
      expect(mockImapInstance.openBox).toHaveBeenCalledWith('INBOX', true, expect.any(Function));
    });

    it('should handle Outlook IMAP errors', async () => {
      // Mock IMAP methods with error
      mockImapInstance.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') setTimeout(callback, 0);
      });
      mockImapInstance.openBox.mockImplementation((box: string, readOnly: boolean, callback: (err?: Error) => void) => {
        setTimeout(() => callback(new Error('IMAP Error')), 0);
      });
      
      const connectPromise = outlookService.connect();
      
      // Trigger ready event
      const readyCallback = mockImapInstance.once.mock.calls.find((call: [string, () => void]) => call[0] === 'ready')?.[1];
      if (readyCallback) readyCallback();
      
      await connectPromise;
      
      const filter: EmailFilter = { fromDomain: testDomain };
      await expect(outlookService.getMessages(filter)).rejects.toThrow('IMAP Error');
    });

    it('should handle Outlook IMAP not initialized error', async () => {
      // Don't connect, so IMAP is not initialized
      const filter: EmailFilter = { fromDomain: testDomain };
      await expect(outlookService.getMessages(filter)).rejects.toThrow('IMAP not initialized');
    });

    it('should handle Outlook IMAP search error', async () => {
      // Mock IMAP methods with search error
      mockImapInstance.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') setTimeout(callback, 0);
      });
      mockImapInstance.openBox.mockImplementation((box: string, readOnly: boolean, callback: (err?: Error) => void) => {
        setTimeout(() => callback(), 0);
      });
      mockImapInstance.search.mockImplementation((criteria: unknown, callback: (err?: Error, results?: unknown[]) => void) => {
        setTimeout(() => callback(new Error('Search Error')), 0);
      });
      
      const connectPromise = outlookService.connect();
      
      // Trigger ready event
      const readyCallback = mockImapInstance.once.mock.calls.find((call: [string, () => void]) => call[0] === 'ready')?.[1];
      if (readyCallback) readyCallback();
      
      await connectPromise;
      
      const filter: EmailFilter = { fromDomain: testDomain };
      await expect(outlookService.getMessages(filter)).rejects.toThrow('Search Error');
    });
  });

  describe('disconnect', () => {
    it('should disconnect IMAP connection', async () => {
      // Connect first
      mockImapInstance.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') setTimeout(callback, 0);
      });
      
      const connectPromise = outlookService.connect();
      
      // Trigger ready event
      const readyCallback = mockImapInstance.once.mock.calls.find((call: [string, () => void]) => call[0] === 'ready')?.[1];
      if (readyCallback) readyCallback();
      
      await connectPromise;
      
      outlookService.disconnect();
      
      expect(mockImapInstance.end).toHaveBeenCalled();
    });

    it('should not throw when disconnecting without connection', () => {
      expect(() => outlookService.disconnect()).not.toThrow();
    });
  });
});