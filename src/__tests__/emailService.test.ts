import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GmailService } from '../services/gmailService';
import { BaseEmailService } from '../services/emailService';
import { EmailConfig, EmailProvider } from '../types/email';
import { ClientRequest, IncomingMessage } from 'http';
import https from 'https';

vi.mock('https');
const mockHttps = vi.mocked(https);

describe('EmailService', () => {
  const testDomain = 'mywellness.com';
  const testEmail = 'test@gmail.com';

  let mockConfig: EmailConfig;

  beforeEach(() => {
    vi.clearAllMocks();
        
    mockConfig = {
      provider: EmailProvider.Gmail,
      email: testEmail,
      domain: testDomain
    };
  });

  describe('BaseEmailService - downloadWorkoutFile', () => {
    const url = 'https://example.com/workout.tcx';

    let eventListeners: { [key: string]: Function };
    let baseService: BaseEmailService;
    let mockResponse: Partial<IncomingMessage>;
    let mockRequest: Partial<ClientRequest>;

    beforeEach(() => {
      baseService = new GmailService(mockConfig);
      eventListeners = {};

      mockResponse = {
        on: vi.fn().mockImplementation((event: string, callback: Function) => {
          eventListeners[event] = callback;
        }),
        statusCode: 200,
        headers: { 'content-disposition': 'attachment; filename="workout.tcx"'}
      } as Partial<IncomingMessage>;

      mockRequest = {
        on: vi.fn(),
        setTimeout: vi.fn(),
        destroy: vi.fn()
      } as Partial<ClientRequest>;
      
      mockHttps.get.mockImplementation((_: any, callback?: any) => {
        if (callback) {
          callback(mockResponse);
        }
        return mockRequest as ClientRequest;
      });
    });

    it('should download file successfully via HTTPS', async () => {
      const testData = [ 
        Buffer.from('<tcx><workout>'),
        Buffer.from('</workout></tcx>')
      ];
      
      const promise = baseService.downloadWorkoutFile(url);

      // Simulate data events after listeners are registered
      testData.forEach(chunk => eventListeners['data'](chunk));
      eventListeners['end']();

      const result = await promise;
      
      expect(result.filename).toBe('workout.tcx');
      expect(result.data.toString()).toBe('<tcx><workout></workout></tcx>');
      expect(https.get).toHaveBeenCalledWith(url, expect.any(Function));
    });
    
    it('should handle HTTP redirects', async () => {
      const testData = [ 
        Buffer.from('<tcx><workout>'),
        Buffer.from('</workout></tcx>')
      ];
      const redirectUrl = 'https://cdn.example.com/workout.tcx';
      
      // set up mock redirect response followed by succcess
      let callCount = 0;
      mockHttps.get.mockImplementation((_, callback?: any) => {
        callCount++;
        const response = callCount === 1 
        ? { ...mockResponse, statusCode: 302, headers: { location: redirectUrl } }
        : { ...mockResponse, statusCode: 200 };
        
        callback(response);
        return mockRequest as ClientRequest;
      });
      
      let promise = baseService.downloadWorkoutFile(url);
      testData.forEach(chunk => eventListeners['data'](chunk));
      eventListeners['end']();
      const result = await promise;
      
      expect(result.filename).toBe('workout.tcx');
      expect(result.data.toString()).toEqual('<tcx><workout></workout></tcx>');
      expect(mockHttps.get).toHaveBeenCalledTimes(2);
    });

    it('should handle HTTP errors', async () => {      
      mockHttps.get.mockImplementation((_, callback?: any) => {
        callback({ ...mockResponse, statusCode: 404 });
        return mockRequest as ClientRequest;
      });
      
      await expect(baseService.downloadWorkoutFile(url)).rejects.toThrow('Failed to download file: HTTP 404');
    });

    it('should reject on missing URL parameter', async () => {
      await expect(baseService.downloadWorkoutFile('')).rejects.toThrow('URL is required to download workout file');
    });

    it('should handle network errors on response', async () => {
      const error = new Error('Network error');
      mockResponse.on = vi.fn().mockImplementation((event: string, callback: (error: Error) => void) => {
        if (event === 'error') {
          callback(error);
        }
      });
      
      await expect(baseService.downloadWorkoutFile(url)).rejects.toThrow('Network error');
    });

    it('should handle timeout', async () => {
      mockRequest.setTimeout = vi.fn().mockImplementation((timeout: number, callback: () => void) => {
        setTimeout(callback, 0);
      });
      
      await expect(baseService.downloadWorkoutFile(url)).rejects.toThrow('Download of workout file timed out');
      expect(mockRequest.destroy).toHaveBeenCalled();
    });

    it('should extract filename from URL path when no Content-Disposition', async () => {
      const testData = Buffer.from('test workout data');
      const url = 'https://example.com/path/to/myworkout.tcx';
      
      mockResponse.headers = {};
      mockResponse.statusCode = 200;
      mockHttps.get.mockImplementation((_, callback?: any) => {
        callback(mockResponse);
        return mockRequest as ClientRequest;
      });
      
      (mockResponse.on as any).mockImplementation((event: string, callback: (data?: Buffer) => void) => {
        if (event === 'data') {
          callback(testData);
        } else if (event === 'end') {
          callback();
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
      
      mockHttps.get.mockImplementation((_, callback?: any) => {
        callback(mockResponse);
        return mockRequest as ClientRequest;
      });
      
      mockResponse.on = vi.fn().mockImplementation((event: string, callback: (data?: Buffer) => void) => {
        if (event === 'data') {
          callback(testData);
        } else if (event === 'end') {
          callback();
        }
      });
      
      const result = await baseService.downloadWorkoutFile(url, 100, customFilename);
      
      expect(result.filename).toBe(customFilename);
      expect(result.data).toEqual(testData);
    });

    it('should add .tcx extension if missing from extracted filename', async () => {
      const testData = Buffer.from('test workout data');
      const url = 'https://example.com/path/to/myworkout';
      mockResponse.headers = {'content-disposition': 'attachment; filename="myworkout"'};
      
      mockHttps.get.mockImplementation((_, callback?: any) => {
        callback(mockResponse);
        return mockRequest as ClientRequest;
      });
      
      mockResponse.on = vi.fn().mockImplementation((event: string, callback: (data?: Buffer) => void) => {
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