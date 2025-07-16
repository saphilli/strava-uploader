import { EmailService } from '../services/emailService';
import { EmailConfig } from '../types/email';
import fs from 'fs';

// Mock dependencies
jest.mock('googleapis');
jest.mock('@google-cloud/local-auth');
jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('EmailService', () => {
  let emailService: EmailService;
  let mockConfig: EmailConfig;

  beforeEach(() => {
    mockConfig = {
      provider: 'gmail',
      email: 'test@gmail.com',
      domain: 'mywellness.com'
    };
    
    emailService = new EmailService(mockConfig);
  });

  describe('constructor', () => {
    it('should create EmailService instance with Gmail provider', () => {
      expect(emailService).toBeInstanceOf(EmailService);
    });

    it('should create EmailService instance with Outlook provider', () => {
      const outlookConfig: EmailConfig = {
        provider: 'outlook',
        email: 'test@outlook.com',
        domain: 'mywellness.com',
        auth: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: 'test-refresh-token'
        }
      };
      
      const outlookService = new EmailService(outlookConfig);
      expect(outlookService).toBeInstanceOf(EmailService);
    });
  });

  describe('connect', () => {
    it('should throw error for Gmail without credentials.json', async () => {
      mockFs.existsSync.mockReturnValue(false);
      
      await expect(emailService.connect()).rejects.toThrow(
        'credentials.json file not found'
      );
    });
  });

  describe('getMessages', () => {
    it('should throw error when gmail is not initialized', async () => {
      await expect(emailService.getMessages({
        fromDomain: 'test.com',
        hasAttachments: true
      })).rejects.toThrow('Gmail service not initialized. Call connect() first.');
    });
  });

  describe('disconnect', () => {
    it('should disconnect without errors', () => {
      expect(() => emailService.disconnect()).not.toThrow();
    });
  });
});