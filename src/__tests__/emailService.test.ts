import { GmailService } from '../services/gmailService';
import { BaseEmailService } from '../services/emailService';
import { EmailConfig, EmailProvider } from '../types/email';
import { ClientRequest, IncomingMessage } from 'http';
import https from 'https';

jest.mock('https');
const mockHttps = https as jest.Mocked<typeof https>;

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

  describe('BaseEmailService - downloadWorkoutFile', () => {
    const url = 'https://example.com/workout.tcx';

    let eventListeners: { [key: string]: Function };
    let baseService: BaseEmailService;
    let mockResponse: jest.Mocked<IncomingMessage>;
    let mockRequest: jest.Mocked<ClientRequest>;

    beforeEach(() => {
      baseService = new GmailService(mockConfig);
      eventListeners = {};

      mockResponse = {
        on: jest.fn().mockImplementation((event: string, callback: Function) => {
          eventListeners[event] = callback;
        }),
        statusCode: 200,
        headers: { 'content-disposition': 'attachment; filename="workout.tcx"'}
      } as unknown as jest.Mocked<IncomingMessage>;

      mockRequest = {
        on: jest.fn(),
        setTimeout: jest.fn(),
        destroy: jest.fn()
      } as unknown as jest.Mocked<ClientRequest>;
      
      mockHttps.get.mockImplementation((_: any, callback?: any) => {
        if (callback) {
          callback(mockResponse);
        }
        return mockRequest;
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
        return mockRequest;
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
      mockHttps.get.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        setTimeout(() => callback({ ...mockResponse, statusCode: 404 }), 0);
        return mockRequest as any;
      });
      
      await expect(baseService.downloadWorkoutFile(url)).rejects.toThrow('Failed to download file: HTTP 404');
    });

    it('should handle network errors', async () => {
      const error = new Error('Network error');
      let test = jest.fn().mockImplementation((...args: any[]) => {
      mockResponse.on.mockImplementation((event: string, callback: (error: Error) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(error), 0);
        }
      });
      
      await expect(baseService.downloadWorkoutFile(url)).rejects.toThrow('Network error');
    });

    it('should handle timeout', async () => {
      mockRequest.setTimeout = jest.fn().mockImplementation((timeout: number, callback: () => void) => {
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
        return mockRequest;
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