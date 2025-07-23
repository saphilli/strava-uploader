import { EmailService } from '../services/emailService';
import { EmailConfig, EmailProvider, EmailFilter } from '../types/email';
import fs from 'fs';
import { google } from 'googleapis';
import { authenticate } from '@google-cloud/local-auth';
import Imap from 'imap';

// Mock dependencies
jest.mock('googleapis');
jest.mock('@google-cloud/local-auth');
jest.mock('fs');
jest.mock('imap');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockGoogle = google as jest.Mocked<typeof google>;
const mockAuthenticate = authenticate as jest.MockedFunction<typeof authenticate>;
const mockImap = Imap as jest.MockedClass<typeof Imap>;

describe('EmailService', () => {
  let emailService: EmailService;
  let mockConfig: EmailConfig;
  let mockGmailApi: any;
  let mockImapInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      provider: EmailProvider.Gmail,
      email: 'test@gmail.com',
      domain: 'mywellness.com'
    };
    
    // Mock Gmail API
    mockGmailApi = {
      users: {
        getProfile: jest.fn().mockResolvedValue({ data: { emailAddress: 'test@gmail.com' } }),
        messages: {
          list: jest.fn().mockResolvedValue({ data: { messages: [] } }),
          get: jest.fn().mockResolvedValue({ data: {} }),
          attachments: {
            get: jest.fn().mockResolvedValue({ data: { data: 'dGVzdCBkYXRh' } })
          }
        }
      }
    };
    
    mockGoogle.gmail.mockReturnValue(mockGmailApi);
    mockGoogle.auth = {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
        gaxios: { defaults: {} }
      }))
    } as any;
    
    // Mock IMAP instance
    mockImapInstance = {
      once: jest.fn(),
      connect: jest.fn(),
      end: jest.fn(),
      openBox: jest.fn(),
      search: jest.fn()
    };
    
    mockImap.mockImplementation(() => mockImapInstance);
    
    emailService = new EmailService(mockConfig);
  });

  describe('constructor', () => {
    it('should create EmailService instance with Gmail provider', () => {
      expect(emailService).toBeInstanceOf(EmailService);
    });

    it('should create EmailService instance with Outlook provider', () => {
      const outlookConfig: EmailConfig = {
        provider: EmailProvider.Outlook,
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

    it('should connect to Gmail successfully with existing token', async () => {
      const mockCredentials = {
        installed: {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          redirect_uris: ['http://localhost']
        }
      };
      const mockToken = { access_token: 'test-token', refresh_token: 'test-refresh' };
      
      mockFs.existsSync.mockImplementation((path: any) => {
        if (path.includes('credentials.json')) return true;
        if (path.includes('token.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((path: any) => {
        if (path.includes('credentials.json')) return JSON.stringify(mockCredentials);
        if (path.includes('token.json')) return JSON.stringify(mockToken);
        return '';
      });
      
      await emailService.connect();
      
      expect(mockGmailApi.users.getProfile).toHaveBeenCalledWith({ userId: 'me' });
    });

    it('should connect to Gmail successfully with new authentication', async () => {
      const mockCredentials = {
        web: {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          redirect_uris: ['http://localhost']
        }
      };
      const mockAuth = {
        credentials: { access_token: 'new-token' },
        gaxios: { defaults: {} }
      };
      
      mockFs.existsSync.mockImplementation((path: any) => {
        if (path.includes('credentials.json')) return true;
        if (path.includes('token.json')) return false;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockCredentials));
      mockFs.writeFileSync.mockImplementation();
      mockAuthenticate.mockResolvedValue(mockAuth as any);
      
      await emailService.connect();
      
      expect(mockAuthenticate).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      expect(mockGmailApi.users.getProfile).toHaveBeenCalledWith({ userId: 'me' });
    });

    it('should throw error for invalid credentials.json', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ invalid: 'credentials' }));
      
      // The error will be a destructuring error since installed/web are undefined
      await expect(emailService.connect()).rejects.toThrow();
    });

    it('should throw error for incomplete credentials.json', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ 
        installed: { 
          client_id: 'test',
          // missing client_secret and redirect_uris
        }
      }));
      
      await expect(emailService.connect()).rejects.toThrow(
        'Invalid or incomplete credentials.json file'
      );
    });

    it('should connect to Outlook successfully', async () => {
      const outlookConfig: EmailConfig = {
        provider: EmailProvider.Outlook,
        email: 'test@outlook.com',
        domain: 'mywellness.com',
        auth: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: 'test-refresh-token'
        }
      };
      
      const outlookService = new EmailService(outlookConfig);
      
      // Mock IMAP ready event
      mockImapInstance.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') {
          setTimeout(callback, 0);
        }
      });
      
      await outlookService.connect();
      
      expect(mockImapInstance.connect).toHaveBeenCalled();
    });

    it('should handle Outlook connection error', async () => {
      const outlookConfig: EmailConfig = {
        provider: EmailProvider.Outlook,
        email: 'test@outlook.com',
        domain: 'mywellness.com',
        auth: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: 'test-refresh-token'
        }
      };
      
      const outlookService = new EmailService(outlookConfig);
      const error = new Error('Connection failed');
      
      mockImapInstance.once.mockImplementation((event: string, callback: (err?: Error) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(error), 0);
        }
      });
      
      await expect(outlookService.connect()).rejects.toThrow('Connection failed');
    });

    it('should throw error for Outlook without auth config', async () => {
      const outlookConfig: EmailConfig = {
        provider: EmailProvider.Outlook,
        email: 'test@outlook.com',
        domain: 'mywellness.com'
      };
      
      const outlookService = new EmailService(outlookConfig);
      
      await expect(outlookService.connect()).rejects.toThrow(
        'OAuth configuration is required for Outlook'
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

    it('should fetch Gmail messages successfully', async () => {
      // Setup Gmail connection
      const mockCredentials = {
        installed: {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          redirect_uris: ['http://localhost']
        }
      };
      mockFs.existsSync.mockImplementation((path: any) => path.includes('credentials.json'));
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockCredentials));
      mockAuthenticate.mockResolvedValue({ credentials: {}, gaxios: { defaults: {} } } as any);
      
      await emailService.connect();
      
      // Setup message data
      const mockMessages = [{ id: 'msg1' }];
      const mockFullMessage = {
        data: {
          id: 'msg1',
          payload: {
            headers: [
              { name: 'From', value: 'test@mywellness.com' },
              { name: 'Subject', value: 'Test Subject' },
              { name: 'Date', value: '2025-01-01T00:00:00Z' }
            ],
            parts: [
              {
                filename: 'workout.tcx',
                mimeType: 'text/xml',
                body: { size: 1024, attachmentId: 'att1' }
              }
            ]
          }
        }
      };
      
      mockGmailApi.users.messages.list.mockResolvedValue({ data: { messages: mockMessages } });
      mockGmailApi.users.messages.get.mockResolvedValue(mockFullMessage);
      
      const filter: EmailFilter = { fromDomain: 'mywellness.com', hasAttachments: true };
      const result = await emailService.getMessages(filter);
      
      expect(result).toHaveLength(1);
      expect(result[0].from).toBe('test@mywellness.com');
      expect(result[0].subject).toBe('Test Subject');
      expect(result[0].hasAttachments).toBe(true);
      expect(result[0].attachments).toHaveLength(1);
    });

    it('should return empty array when no Gmail messages found', async () => {
      // Setup Gmail connection
      const mockCredentials = {
        installed: {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          redirect_uris: ['http://localhost']
        }
      };
      mockFs.existsSync.mockImplementation((path: any) => path.includes('credentials.json'));
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockCredentials));
      mockAuthenticate.mockResolvedValue({ credentials: {}, gaxios: { defaults: {} } } as any);
      
      await emailService.connect();
      
      mockGmailApi.users.messages.list.mockResolvedValue({ data: {} });
      
      const filter: EmailFilter = { fromDomain: 'mywellness.com', hasAttachments: true };
      const result = await emailService.getMessages(filter);
      
      expect(result).toEqual([]);
    });

    it('should handle Gmail API errors', async () => {
      // Setup Gmail connection
      const mockCredentials = {
        installed: {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          redirect_uris: ['http://localhost']
        }
      };
      mockFs.existsSync.mockImplementation((path: any) => path.includes('credentials.json'));
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockCredentials));
      mockAuthenticate.mockResolvedValue({ credentials: {}, gaxios: { defaults: {} } } as any);
      
      await emailService.connect();
      
      const error = new Error('API Error');
      mockGmailApi.users.messages.list.mockRejectedValue(error);
      
      const filter: EmailFilter = { fromDomain: 'mywellness.com', hasAttachments: true };
      await expect(emailService.getMessages(filter)).rejects.toThrow('API Error');
    });

    it('should fetch Outlook messages successfully', async () => {
      const outlookConfig: EmailConfig = {
        provider: EmailProvider.Outlook,
        email: 'test@outlook.com',
        domain: 'mywellness.com',
        auth: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: 'test-refresh-token'
        }
      };
      
      const outlookService = new EmailService(outlookConfig);
      
      // Mock IMAP methods
      mockImapInstance.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') setTimeout(callback, 0);
      });
      mockImapInstance.openBox.mockImplementation((box: string, readOnly: boolean, callback: (err?: Error) => void) => {
        setTimeout(() => callback(), 0);
      });
      mockImapInstance.search.mockImplementation((criteria: any, callback: (err?: Error, results?: any[]) => void) => {
        setTimeout(() => callback(undefined, []), 0);
      });
      
      await outlookService.connect();
      
      const filter: EmailFilter = { fromDomain: 'mywellness.com', hasAttachments: true };
      const result = await outlookService.getMessages(filter);
      
      expect(result).toEqual([]);
      expect(mockImapInstance.openBox).toHaveBeenCalledWith('INBOX', true, expect.any(Function));
    });

    it('should handle Outlook IMAP errors', async () => {
      const outlookConfig: EmailConfig = {
        provider: EmailProvider.Outlook,
        email: 'test@outlook.com',
        domain: 'mywellness.com',
        auth: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: 'test-refresh-token'
        }
      };
      
      const outlookService = new EmailService(outlookConfig);
      
      // Mock IMAP methods with error
      mockImapInstance.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') setTimeout(callback, 0);
      });
      mockImapInstance.openBox.mockImplementation((box: string, readOnly: boolean, callback: (err?: Error) => void) => {
        setTimeout(() => callback(new Error('IMAP Error')), 0);
      });
      
      await outlookService.connect();
      
      const filter: EmailFilter = { fromDomain: 'mywellness.com', hasAttachments: true };
      await expect(outlookService.getMessages(filter)).rejects.toThrow('IMAP Error');
    });

    it('should handle Outlook IMAP not initialized error', async () => {
      const outlookConfig: EmailConfig = {
        provider: EmailProvider.Outlook,
        email: 'test@outlook.com',
        domain: 'mywellness.com',
        auth: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: 'test-refresh-token'
        }
      };
      
      const outlookService = new EmailService(outlookConfig);
      
      // Don't connect, so IMAP is not initialized
      const filter: EmailFilter = { fromDomain: 'mywellness.com', hasAttachments: true };
      await expect(outlookService.getMessages(filter)).rejects.toThrow('IMAP not initialized');
    });

    it('should handle Outlook IMAP search error', async () => {
      const outlookConfig: EmailConfig = {
        provider: EmailProvider.Outlook,
        email: 'test@outlook.com',
        domain: 'mywellness.com',
        auth: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: 'test-refresh-token'
        }
      };
      
      const outlookService = new EmailService(outlookConfig);
      
      // Mock IMAP methods with search error
      mockImapInstance.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'ready') setTimeout(callback, 0);
      });
      mockImapInstance.openBox.mockImplementation((box: string, readOnly: boolean, callback: (err?: Error) => void) => {
        setTimeout(() => callback(), 0);
      });
      mockImapInstance.search.mockImplementation((criteria: any, callback: (err?: Error, results?: any[]) => void) => {
        setTimeout(() => callback(new Error('Search Error')), 0);
      });
      
      await outlookService.connect();
      
      const filter: EmailFilter = { fromDomain: 'mywellness.com', hasAttachments: true };
      await expect(outlookService.getMessages(filter)).rejects.toThrow('Search Error');
    });

    it('should return empty array for unknown provider', async () => {
      // Create a service with an unknown provider by casting
      const unknownConfig = {
        provider: 'unknown' as any,
        email: 'test@unknown.com',
        domain: 'test.com'
      };
      const unknownService = new EmailService(unknownConfig);
      
      const filter: EmailFilter = { fromDomain: 'test.com', hasAttachments: true };
      const result = await unknownService.getMessages(filter);
      
      expect(result).toEqual([]);
    });
  });

  describe('downloadAttachment', () => {
    it('should download Gmail attachment successfully', async () => {
      // Setup Gmail connection
      const mockCredentials = {
        installed: {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          redirect_uris: ['http://localhost']
        }
      };
      mockFs.existsSync.mockImplementation((path: any) => path.includes('credentials.json'));
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockCredentials));
      mockAuthenticate.mockResolvedValue({ credentials: {}, gaxios: { defaults: {} } } as any);
      
      await emailService.connect();
      
      const result = await emailService.downloadAttachment('msg1', 'att1');
      
      expect(result).toEqual(Buffer.from('test data'));
      expect(mockGmailApi.users.messages.attachments.get).toHaveBeenCalledWith({
        userId: 'me',
        messageId: 'msg1',
        id: 'att1'
      });
    });

    it('should throw error for non-Gmail provider', async () => {
      const outlookConfig: EmailConfig = {
        provider: EmailProvider.Outlook,
        email: 'test@outlook.com',
        domain: 'mywellness.com',
        auth: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: 'test-refresh-token'
        }
      };
      
      const outlookService = new EmailService(outlookConfig);
      
      await expect(outlookService.downloadAttachment('msg1', 'att1')).rejects.toThrow(
        'Attachment download not implemented for this provider'
      );
    });
  });

  describe('disconnect', () => {
    it('should disconnect without errors when no IMAP connection', () => {
      expect(() => emailService.disconnect()).not.toThrow();
    });

    it('should disconnect IMAP connection for Outlook', () => {
      const outlookConfig: EmailConfig = {
        provider: EmailProvider.Outlook,
        email: 'test@outlook.com',
        domain: 'mywellness.com',
        auth: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: 'test-refresh-token'
        }
      };
      
      const outlookService = new EmailService(outlookConfig);
      
      // Simulate having an IMAP connection
      (outlookService as any).imap = mockImapInstance;
      
      outlookService.disconnect();
      
      expect(mockImapInstance.end).toHaveBeenCalled();
    });
  });
});