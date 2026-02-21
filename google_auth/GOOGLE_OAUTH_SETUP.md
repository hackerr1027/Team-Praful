# Google OAuth Setup Guide

This guide will help you set up Google OAuth authentication for your Fleet Management System.

## Prerequisites
- Google Cloud Platform account
- Domain name (for production)

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown and select "NEW PROJECT"
3. Enter a project name (e.g., "Fleet Management System")
4. Click "CREATE"

## Step 2: Enable Google Sign-In API

1. In your project dashboard, go to "APIs & Services" > "Library"
2. Search for "Google Sign-In API"
3. Click on it and then click "ENABLE"

## Step 3: Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Choose "External" and click "CREATE"
3. Fill in the required information:
   - **App name**: Fleet Management System
   - **User support email**: your-email@example.com
   - **Developer contact information**: your-email@example.com
4. Click "SAVE AND CONTINUE"
5. Add scopes (click "ADD OR REMOVE SCOPES"):
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
6. Click "SAVE AND CONTINUE"
7. Add test users (for development):
   - Add your Google account email
8. Click "SAVE AND CONTINUE" then "BACK TO DASHBOARD"

## Step 4: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "+ CREATE CREDENTIALS" > "OAuth client ID"
3. Select "Web application" as the application type
4. Give it a name (e.g., "Fleet Management Web Client")
5. Add authorized JavaScript origins:
   - For development: `http://localhost:8000`
   - For production: `https://yourdomain.com`
6. Add authorized redirect URIs (leave blank for Google Sign-In)
7. Click "CREATE"

## Step 5: Update Your Application

1. Copy the **Client ID** from the credentials page
2. Replace `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` in the following files:
   - `index.html` (line 8)
   - `script.js` (line 2)

### Update index.html:
```html
<meta name="google-signin-client_id" content="YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com">
```

### Update script.js:
```javascript
const GOOGLE_CLIENT_ID = 'YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com';
```

## Step 6: Test the Integration

1. Restart your local server
2. Open `http://localhost:8000` in your browser
3. Click on "Sign in with Google"
4. Sign in with your Google account
5. Select your role in the modal
6. Verify successful authentication

## Production Deployment

For production deployment:

1. Add your production domain to authorized JavaScript origins
2. Add your production domain to authorized redirect URIs
3. Publish your OAuth consent screen
4. Update the client ID in your production code

## Troubleshooting

### Common Issues:

1. **"redirect_uri_mismatch" error**
   - Make sure your domain is added to authorized JavaScript origins
   - Check that you're using the correct Client ID

2. **"invalid_client" error**
   - Verify the Client ID is correctly copied
   - Ensure there are no extra spaces or characters

3. **"access_denied" error**
   - Make sure your OAuth consent screen is properly configured
   - Add your email as a test user during development

4. **Google Sign-In button not appearing**
   - Check browser console for JavaScript errors
   - Ensure the Google script is loading correctly
   - Verify your Client ID is valid

## Security Considerations

- Never expose your Client Secret in frontend code
- Use HTTPS in production
- Regularly rotate your client credentials
- Monitor your OAuth usage in Google Cloud Console
- Implement proper session management on the backend

## Next Steps

After setting up Google OAuth:

1. Implement backend validation of Google tokens
2. Add user profile management
3. Implement role-based access control
4. Add session timeout and refresh mechanisms
5. Set up logging and monitoring

For more information, visit the [Google Identity Platform documentation](https://developers.google.com/identity).
