export interface EmailConfig {
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
  downloadLinks: string[];
}

export interface EmailFilter {
  fromDomain: string;
}

