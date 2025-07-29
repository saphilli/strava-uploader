import { GmailService } from '../services/gmailService';
import { BaseEmailService } from '../services/emailService';
import { EmailConfig, EmailProvider, EmailFilter } from '../types/email';
import fs from 'fs';
import { google } from 'googleapis';
import { authenticate } from '@google-cloud/local-auth';

// Mock dependencies
jest.mock('googleapis');
jest.mock('@google-cloud/local-auth');
jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockGoogle = google as jest.Mocked<typeof google>;
const mockAuthenticate = authenticate as jest.MockedFunction<typeof authenticate>;

describe('GmailService', () => {
  const testDomain = 'mywellness.com';
  const testEmail = 'test@gmail.com';

  let gmailService: GmailService;
  let mockConfig: EmailConfig;
  let mockGmailApi: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      provider: EmailProvider.Gmail,
      email: testEmail,
      domain: testDomain
    };
    
    // Mock Gmail API
    mockGmailApi = {
      users: {
        getProfile: jest.fn().mockResolvedValue({ data: { emailAddress: testEmail } }),
        messages: {
          list: jest.fn().mockResolvedValue({ data: { messages: [] } }),
          get: jest.fn().mockResolvedValue({ data: {} })
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
    
    gmailService = new GmailService(mockConfig);
  });

  describe('constructor', () => {
    it('should create GmailService instance', () => {
      expect(gmailService).toBeInstanceOf(GmailService);
      expect(gmailService).toBeInstanceOf(BaseEmailService);
    });
  });

  describe('connect', () => {
    it('should throw error without credentials.json', async () => {
      mockFs.existsSync.mockReturnValue(false);
      
      await expect(gmailService.connect()).rejects.toThrow(
        'credentials.json file not found'
      );
    });

    it('should connect successfully with existing token', async () => {
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
      
      await gmailService.connect();
      
      expect(mockGmailApi.users.getProfile).toHaveBeenCalledWith({ userId: 'me' });
    });

    it('should connect successfully with new authentication', async () => {
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
      
      await gmailService.connect();
      
      expect(mockAuthenticate).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      expect(mockGmailApi.users.getProfile).toHaveBeenCalledWith({ userId: 'me' });
    });

    it('should throw error for invalid credentials.json', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ invalid: 'credentials' }));
      
      await expect(gmailService.connect()).rejects.toThrow();
    });

    it('should throw error for incomplete credentials.json', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ 
        installed: { 
          client_id: 'test',
          // missing client_secret and redirect_uris
        }
      }));
      
      await expect(gmailService.connect()).rejects.toThrow(
        'Invalid or incomplete credentials.json file'
      );
    });
  });

  describe('getMessages', () => {
    it('should throw error when gmail is not initialized', async () => {
      await expect(gmailService.getMessages({
        fromDomain: 'test.com'
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
      
      await gmailService.connect();
      
      // Setup message data
      const mockMessages = [{ id: 'msg1' }];
      const mockFullMessage = {
        data: {
          id: 'msg1',
          payload: {
            headers: [
              { name: 'From', value: `test@${testDomain}` },
              { name: 'Subject', value: 'Test Subject' },
              { name: 'Date', value: '2025-01-01T00:00:00Z' }
            ],
            parts: [
              {
                mimeType: 'text/html',
                body: { 
                  data: Buffer.from('<a href="https://example.com/workout.tcx">Download</a>').toString('base64')
                }
              }
            ]
          }
        }
      };
      
      mockGmailApi.users.messages.list.mockResolvedValue({ data: { messages: mockMessages } });
      mockGmailApi.users.messages.get.mockResolvedValue(mockFullMessage);
      
      const filter: EmailFilter = { fromDomain: testDomain };
      const result = await gmailService.getMessages(filter);
      
      expect(result).toHaveLength(1);
      expect(result[0].from).toBe(`test@${testDomain}`);
      expect(result[0].subject).toBe('Test Subject');
      expect(result[0].downloadLinks).toContain('https://example.com/workout.tcx');
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
      
      await gmailService.connect();
      
      mockGmailApi.users.messages.list.mockResolvedValue({ data: {} });
      
      const filter: EmailFilter = { fromDomain: testDomain };
      const result = await gmailService.getMessages(filter);
      
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
      
      await gmailService.connect();
      
      const error = new Error('API Error');
      mockGmailApi.users.messages.list.mockRejectedValue(error);
      
      const filter: EmailFilter = { fromDomain: testDomain };
      await expect(gmailService.getMessages(filter)).rejects.toThrow('API Error');
    });
  });
});