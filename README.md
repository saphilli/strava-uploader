# strava-uploader
App that automates uploading of workouts to Strava from Technogym treadmills 

## Features

- **Email Monitoring Service**: Monitors email inbox for Technogym workout data
- **Multi-provider Support**: Works with Gmail and Outlook via IMAP/OAuth
- **Automatic Filtering**: Filters emails from technogym.com domain
- **Attachment Processing**: Detects and processes workout file attachments
- **Flexible Scheduling**: Supports scheduled, continuous, or one-time monitoring
- **Comprehensive Logging**: Logs all email processing activities

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy and configure environment variables:
   ```bash
   cp .env.example .env
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Configuration

Configure your email provider credentials in `.env`:

### Gmail Setup
- `GOOGLE_CLIENT_ID`: Your Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Your Google OAuth client secret  
- `GOOGLE_REFRESH_TOKEN`: Your Google OAuth refresh token

### Outlook Setup
- `OUTLOOK_CLIENT_ID`: Your Outlook OAuth client ID
- `OUTLOOK_CLIENT_SECRET`: Your Outlook OAuth client secret
- `OUTLOOK_REFRESH_TOKEN`: Your Outlook OAuth refresh token

## Usage

### Scheduled Monitoring (default)
```bash
npm start
# or
npm start scheduled
```

### Continuous Monitoring
```bash
npm start continuous
```

### One-time Check
```bash
npm start once
```

### Development
```bash
npm run dev
```

## Logging

The service logs all activities to:
- `logs/combined.log`: All log entries
- `logs/error.log`: Error entries only
- Console: Colored output for development


## OAuth Setup 

⏺ To configure the Gmail OAuth variables, you'll need to set up a Google
  Cloud project and enable Gmail API access. Here's what each variable
  should contain:

  Gmail OAuth Configuration Steps:

  1. GOOGLE_CLIENT_ID

  - Go to https://console.cloud.google.com
  - Create a new project or select existing one
  - Enable Gmail API in the API Library
  - Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
  - Choose "Desktop Application" as application type
  - Copy the generated Client ID

  2. GOOGLE_CLIENT_SECRET

  - From the same OAuth 2.0 Client ID credential
  - Copy the Client Secret value

  3. GOOGLE_REFRESH_TOKEN

  - Use Google's OAuth 2.0 Playground:
  https://developers.google.com/oauthplayground
  - In Step 1: Select "Gmail API v1" →
  "https://www.googleapis.com/auth/gmail.readonly"
  - Click "Authorize APIs" and sign in with your Gmail account
  - In Step 2: Click "Exchange authorization code for tokens"
  - Copy the "Refresh token" value

  Example .env configuration:

  # Gmail OAuth Configuration
  GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googl
  eusercontent.com
  GOOGLE_CLIENT_SECRET=GOCSPX-AbCdEfGhIjKlMnOpQrStUvWxYz12
  GOOGLE_REFRESH_TOKEN=1//04AbCdEfGhIjKlMnOpQrStUvWxYz123456789

  # Email Configuration
  EMAIL_PROVIDER=gmail
  EMAIL_ADDRESS=your-email@gmail.com

  # Monitoring Configuration  
  MONITOR_INTERVAL_MINUTES=5
  LOG_LEVEL=info

  Important Notes:

  - The refresh token allows long-term access without user interaction
  - Gmail API has daily quotas (1 billion quota units/day for free tier)
  - Ensure your Google Cloud project has Gmail API enabled
  - The refresh token doesn't expire unless revoked by the user