import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GmailService } from '../services/gmailService';
import { BaseEmailService } from '../services/emailService';
import { EmailConfig, EmailProvider, EmailFilter } from '../types/email';
import fs from 'fs';
import { google } from 'googleapis';
import { authenticate } from '@google-cloud/local-auth';

// Mock dependencies
vi.mock('googleapis');
vi.mock('@google-cloud/local-auth');
vi.mock('fs');

const mockFs = vi.mocked(fs);
const mockGoogle = vi.mocked(google);
const mockAuthenticate = vi.mocked(authenticate);

describe('GmailService', () => {
  const testDomain = 'mywellness.com';
  const testEmail = 'test@gmail.com';

  let gmailService: GmailService;
  let mockConfig: EmailConfig;
  let mockGmailApi: any;
  let mockMessages: any;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockConfig = {
      provider: EmailProvider.Gmail,
      email: testEmail,
      domain: testDomain
    };

    // Create mock messages resource
    mockMessages = {
      list: vi.fn(),
      get: vi.fn()
    } as any;

    let mockUsers = {
      getProfile: vi.fn().mockResolvedValue({ data: { emailAddress: testEmail } }),
      messages: mockMessages
    } as any;

    // Create mock Gmail API
    mockGmailApi = {
      context: {
        _options: {},
        _google: mockGoogle,
        _auth: {} as any,
      },
      users: mockUsers
    } as any;

    mockGoogle.gmail.mockReturnValue(mockGmailApi);

    // (mockGoogle.auth as any) = {
    //   OAuth2: vi.fn().mockImplementation(() => ({
    //     setCredentials: vi.fn(),
    //     gaxios: { defaults: {} }
    //   }))
    // };
    
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
      
      mockFs.existsSync.mockImplementation((path: fs.PathLike) => {
        if (path.toString().includes('credentials.json')) return true;
        if (path.toString().includes('token.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((path: fs.PathOrFileDescriptor) => {
        if (path.toString().includes('credentials.json')) return JSON.stringify(mockCredentials);
        if (path.toString().includes('token.json')) return JSON.stringify(mockToken);
        return '';
      });
      
      // Mock OAuth2 constructor
      const mockAuth = {
        setCredentials: vi.fn(),
        gaxios: { defaults: {} }
      };
      (mockGoogle.auth as any) = {
        OAuth2: vi.fn().mockImplementation(() => mockAuth)
      };
      
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
      
      mockFs.existsSync.mockImplementation((path: fs.PathLike) => {
        if (path.toString().includes('credentials.json')) return true;
        if (path.toString().includes('token.json')) return false;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockCredentials));
      mockFs.writeFileSync.mockImplementation(() => {});
      mockAuthenticate.mockResolvedValue(mockAuth as Awaited<ReturnType<typeof authenticate>>);
      
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
      mockFs.existsSync.mockImplementation((path: fs.PathLike) => path.toString().includes('credentials.json'));
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockCredentials));
      mockAuthenticate.mockResolvedValue({ 
        credentials: {}, 
        gaxios: { defaults: {} }
      } as any);
      
      await gmailService.connect();
      
      // Setup message data
      const message = [{ id: 'msg1' }];
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
      
      (mockGmailApi.users.messages.list as vi.Mock).mockResolvedValue({ data: { messages: message } });
      (mockGmailApi.users.messages.get as vi.Mock).mockResolvedValue(mockFullMessage);
      
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
      mockFs.existsSync.mockImplementation((path: fs.PathLike) => path.toString().includes('credentials.json'));
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockCredentials));
      mockAuthenticate.mockResolvedValue({ 
        credentials: {}, 
        gaxios: { defaults: {} }
      } as any);
      
      await gmailService.connect();
      
      (mockGmailApi.users.messages.list as vi.Mock).mockResolvedValue({ data: {} });
      
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
      mockFs.existsSync.mockImplementation((path: fs.PathLike) => path.toString().includes('credentials.json'));
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockCredentials));
      mockAuthenticate.mockResolvedValue({ 
        credentials: {}, 
        gaxios: { defaults: {} }
      } as any);
      
      await gmailService.connect();
      
      const error = new Error('API Error');
      (mockGmailApi.users.messages.list as vi.Mock).mockRejectedValue(error);
      
      const filter: EmailFilter = { fromDomain: testDomain };
      await expect(gmailService.getMessages(filter)).rejects.toThrow('API Error');
    });
  });
});