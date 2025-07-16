import { google } from 'googleapis';
import Imap from 'imap';
import { authenticate } from '@google-cloud/local-auth';
import fs from 'fs';
import path from 'path';
import { EmailConfig, EmailMessage, EmailAttachment, EmailFilter } from '../types/email';
import logger from '../utils/logger';

export class EmailService {
  private config: EmailConfig;
  private gmail?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  private imap?: Imap;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  private async initializeProvider(): Promise<void> {
    if (this.config.provider === 'gmail') {
      await this.initializeGmail();
    } else if (this.config.provider === 'outlook') {
      this.initializeOutlook();
    }
  }

  private async initializeGmail(): Promise<void>
  {
    const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
    const TOKEN_PATH = path.join(process.cwd(), 'token.json');
    const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

    try {
      if (!fs.existsSync(CREDENTIALS_PATH))
      {
        throw new Error('credentials.json file not found. Please download it from Google Cloud Console.');
      }
      
      const credentialsData = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
      const { clientId, clientSecret, redirectUris } = credentialsData.installed || credentialsData.web;

      if (!credentialsData || !clientId || clientSecret || !redirectUris) {
        throw new Error('Invalid or incomplete credentials.json file. Ensure client_id, client_secret, and redirect_uris are present.')
      }

      let auth;
      if (fs.existsSync(TOKEN_PATH)) 
      {
        const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUris);
        oauth2Client.setCredentials(tokenData);
        auth = oauth2Client;
      } 
      else {
        auth = await authenticate({
          scopes: SCOPES,
          keyfilePath: CREDENTIALS_PATH,
        });
        
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(auth.credentials));
      }

      if (auth && auth.gaxios) {
        auth.gaxios.defaults.errorRedactor = false;
      }

      this.gmail = google.gmail({ version: 'v1', auth });
    } catch (error)
    {
      logger.error('Failed to initialize Gmail OAuth:', error);
      throw error;
    }
  }

  private initializeOutlook(): void {
    if (!this.config.auth) {
      throw new Error('OAuth configuration is required for Outlook');
    }
    
    this.imap = new Imap({
      user: this.config.email,
      password: this.config.auth.refreshToken,
      host: 'outlook.office365.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });
  }

  async connect(): Promise<void> {
    try {
      await this.initializeProvider();
      
      if (this.config.provider === 'gmail') {
        await this.gmail.users.getProfile({ userId: 'me' });
        logger.info('Connected to Gmail successfully');
      } else if (this.config.provider === 'outlook' && this.imap) {
        await new Promise<void>((resolve, reject) => {
          this.imap!.once('ready', () => {
            logger.info('Connected to Outlook successfully');
            resolve();
          });
          this.imap!.once('error', reject);
          this.imap!.connect();
        });
      }
    } catch (error) {
      logger.error('Failed to connect to email provider:', error);
      throw error;
    }
  }

  async getMessages(filter: EmailFilter): Promise<EmailMessage[]> {
    try {
      if (this.config.provider === 'gmail') {
        return await this.getGmailMessages(filter);
      } else if (this.config.provider === 'outlook') {
        return await this.getOutlookMessages(filter);
      }
      return [];
    } catch (error) {
      logger.error('Failed to fetch messages:', error);
      throw error;
    }
  }

  private async getGmailMessages(filter: EmailFilter): Promise<EmailMessage[]> {
    const query = `from:${filter.fromDomain} ${filter.hasAttachments ? 'has:attachment' : ''}`;
    
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50
    });

    const messages: EmailMessage[] = [];
    
    if (response.data.messages) {
      for (const message of response.data.messages) {
        const fullMessage = await this.gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });

        const parsedMessage = this.parseGmailMessage(fullMessage.data);
        messages.push(parsedMessage);
      }
    }

    logger.info(`Retrieved ${messages.length} messages from Gmail`);
    return messages;
  }

  private parseGmailMessage(message: any): EmailMessage { // eslint-disable-line @typescript-eslint/no-explicit-any
    const headers = message.payload.headers;
    const from = headers.find((h: any) => h.name === 'From')?.value || ''; // eslint-disable-line @typescript-eslint/no-explicit-any
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || ''; // eslint-disable-line @typescript-eslint/no-explicit-any
    const date = new Date(headers.find((h: any) => h.name === 'Date')?.value || ''); // eslint-disable-line @typescript-eslint/no-explicit-any

    const attachments: EmailAttachment[] = [];
    
    if (message.payload.parts) {
      for (const part of message.payload.parts) {
        if (part.filename && part.body.attachmentId) {
          attachments.push({
            filename: part.filename,
            contentType: part.mimeType,
            size: part.body.size,
            data: Buffer.from('')
          });
        }
      }
    }

    return {
      id: message.id,
      from,
      subject,
      date,
      hasAttachments: attachments.length > 0,
      attachments
    };
  }

  private async getOutlookMessages(filter: EmailFilter): Promise<EmailMessage[]> {
    return new Promise((resolve, reject) => {
      if (!this.imap) {
        reject(new Error('IMAP not initialized'));
        return;
      }

      this.imap.openBox('INBOX', true, (err) => {
        if (err) {
          reject(err);
          return;
        }

        const searchCriteria = ['UNSEEN', ['FROM', filter.fromDomain]];
        
        this.imap!.search(searchCriteria, (err) => {
          if (err) {
            reject(err);
            return;
          }

          const messages: EmailMessage[] = [];
          resolve(messages);
        });
      });
    });
  }

  async downloadAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    if (this.config.provider === 'gmail') {
      const response = await this.gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId
      });

      return Buffer.from(response.data.data, 'base64');
    }
    
    throw new Error('Attachment download not implemented for this provider');
  }

  disconnect(): void {
    if (this.imap) {
      this.imap.end();
    }
    logger.info('Disconnected from email provider');
  }
}