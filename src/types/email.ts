export enum EmailProvider {
  Gmail = 'gmail',
  Outlook = 'outlook'
}

export interface EmailConfig {
  provider: EmailProvider;
  domain: string;
  email: string;
  auth?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
}

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  date: Date;
  hasAttachments: boolean;
  attachments: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  data: Buffer;
}

export interface EmailFilter {
  fromDomain: string;
  hasAttachments: boolean;
}