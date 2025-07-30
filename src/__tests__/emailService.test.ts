import { GmailService } from '../services/gmailService';
import { BaseEmailService } from '../services/emailService';
import { EmailConfig, EmailProvider } from '../types/email';
import https from 'https';
import http from 'http';

// Mock dependencies
jest.mock('https');
jest.mock('http');

const mockHttps = https as jest.Mocked<typeof https>;
const mockHttp = http as jest.Mocked<typeof http>;

describe('EmailService', () => {
  const testDomain = 'mywellness.com';
  const testEmail = 'test@gmail.com';

  let mockConfig: EmailConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      provider: EmailProvider.Gmail,
      email: testEmail,
      domain: testDomain
    };
  });

  describe('IEmailService interface', () => {
    it('should define correct interface methods', () => {
      const service = new GmailService(mockConfig);
      
      expect(typeof service.connect).toBe('function');
      expect(typeof service.disconnect).toBe('function');
      expect(typeof service.getMessages).toBe('function');
      expect(typeof service.downloadWorkoutFile).toBe('function');
    });
  });

  describe('BaseEmailService - downloadWorkoutFile', () => {
    let baseService: BaseEmailService;
    let mockResponse: jest.Mocked<{
      statusCode: number;
      headers: Record<string, string>;
      on: (event: string, callback: (data?: Buffer) => void) => void;
    }>;
    let mockRequest: jest.Mocked<{
      on: (event: string, callback: (error?: Error) => void) => void;
      setTimeout: (timeout: number, callback: () => void) => void;
      destroy: () => void;
    }>;

    beforeEach(() => {
      baseService = new GmailService(mockConfig);
      
      mockResponse = {
        statusCode: 200,
        headers: {},
        on: jest.fn()
      };
      
      mockRequest = {
        on: jest.fn(),
        setTimeout: jest.fn(),
        destroy: jest.fn()
      };
      
      mockHttps.get = jest.fn().mockReturnValue(mockRequest);
      mockHttp.get = jest.fn().mockReturnValue(mockRequest);
    });

    it('should download file successfully via HTTPS', async () => {
      const testData = Buffer.from('test workout data');
      const url = 'https://example.com/workout.tcx';
      
      mockHttps.get.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        setTimeout(() => callback(mockResponse), 0);
        return mockRequest as any;
      });
      
      mockResponse.on.mockImplementation((event: string, callback: (data?: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(testData), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
      });
      
      const result = await baseService.downloadWorkoutFile(url);
      
      expect(result.filename).toBe('workout.tcx');
      expect(result.data).toEqual(testData);
      expect(mockHttps.get).toHaveBeenCalledWith(url, expect.any(Function));
    });

    it('should download file successfully via HTTP', async () => {
      const testData = Buffer.from('test workout data');
      const url = 'http://example.com/workout.tcx';
      
      mockHttp.get.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        setTimeout(() => callback(mockResponse), 0);
        return mockRequest as any;;
      });
      
      mockResponse.on.mockImplementation((event: string, callback: (data?: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(testData), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
      });
      
      const result = await baseService.downloadWorkoutFile(url);
      
      expect(result.filename).toBe('workout.tcx');
      expect(result.data).toEqual(testData);
      expect(mockHttp.get).toHaveBeenCalledWith(url, expect.any(Function));
    });

    it('should handle HTTP redirects', async () => {
      const testData = Buffer.from('test workout data');
      const originalUrl = 'https://example.com/workout.tcx';
      const redirectUrl = 'https://cdn.example.com/workout.tcx';
      
      let callCount = 0;
      mockHttps.get.mockImplementation((...args: any[]) => {
        callCount++;
        const callback = args[args.length - 1];
        const response = callCount === 1 
          ? { ...mockResponse, statusCode: 302, headers: { location: redirectUrl } }
          : { ...mockResponse, statusCode: 200 };
        
        setTimeout(() => callback(response), 0);
        return mockRequest as any;;
      });
      
      mockResponse.on.mockImplementation((event: string, callback: (data?: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(testData), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
      });
      
      const result = await baseService.downloadWorkoutFile(originalUrl);
      
      expect(result.filename).toBe('workout.tcx');
      expect(result.data).toEqual(testData);
      expect(mockHttps.get).toHaveBeenCalledTimes(2);
    });

    it('should handle HTTP errors', async () => {
      const url = 'https://example.com/workout.tcx';
      
      mockHttps.get.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        setTimeout(() => callback({ ...mockResponse, statusCode: 404 }), 0);
        return mockRequest as any;;
      });
      
      await expect(baseService.downloadWorkoutFile(url)).rejects.toThrow('Failed to download file: HTTP 404');
    });

    it('should handle network errors', async () => {
      const url = 'https://example.com/workout.tcx';
      const error = new Error('Network error');
      
      mockRequest.on.mockImplementation((event: string, callback: (error: Error) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(error), 0);
        }
      });
      
      await expect(baseService.downloadWorkoutFile(url)).rejects.toThrow('Network error');
    });

    it('should handle timeout', async () => {
      const url = 'https://example.com/workout.tcx';
      
      mockRequest.setTimeout.mockImplementation((timeout: number, callback: () => void) => {
        setTimeout(callback, 0);
      });
      
      await expect(baseService.downloadWorkoutFile(url)).rejects.toThrow('Download timeout');
      expect(mockRequest.destroy).toHaveBeenCalled();
    });

    it('should extract filename from Content-Disposition header', async () => {
      const testData = Buffer.from('test workout data');
      const url = 'https://example.com/download';
      
      mockResponse.headers['content-disposition'] = 'attachment; filename="custom-workout.tcx"';
      
      mockHttps.get.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        setTimeout(() => callback(mockResponse), 0);
        return mockRequest as any;;
      });
      
      mockResponse.on.mockImplementation((event: string, callback: (data?: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(testData), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
      });
      
      const result = await baseService.downloadWorkoutFile(url);
      
      expect(result.filename).toBe('custom-workout.tcx');
      expect(result.data).toEqual(testData);
    });

    it('should extract filename from URL path when no Content-Disposition', async () => {
      const testData = Buffer.from('test workout data');
      const url = 'https://example.com/path/to/myworkout.tcx';
      
      mockHttps.get.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        setTimeout(() => callback(mockResponse), 0);
        return mockRequest as any;;
      });
      
      mockResponse.on.mockImplementation((event: string, callback: (data?: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(testData), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
      });
      
      const result = await baseService.downloadWorkoutFile(url);
      
      expect(result.filename).toBe('myworkout.tcx');
      expect(result.data).toEqual(testData);
    });

    it('should use custom filename when provided', async () => {
      const testData = Buffer.from('test workout data');
      const url = 'https://example.com/download';
      const customFilename = 'my-custom-workout.tcx';
      
      mockHttps.get.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        setTimeout(() => callback(mockResponse), 0);
        return mockRequest as any;;
      });
      
      mockResponse.on.mockImplementation((event: string, callback: (data?: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(testData), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
      });
      
      const result = await baseService.downloadWorkoutFile(url, customFilename);
      
      expect(result.filename).toBe(customFilename);
      expect(result.data).toEqual(testData);
    });

    it('should add .tcx extension if missing from extracted filename', async () => {
      const testData = Buffer.from('test workout data');
      const url = 'https://example.com/path/to/myworkout';
      
      mockHttps.get.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        setTimeout(() => callback(mockResponse), 0);
        return mockRequest as any;;
      });
      
      mockResponse.on.mockImplementation((event: string, callback: (data?: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(testData), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
      });
      
      const result = await baseService.downloadWorkoutFile(url);
      
      expect(result.filename).toBe('myworkout.tcx');
      expect(result.data).toEqual(testData);
    });
  });
});