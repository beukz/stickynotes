# Chrome Web Store Justifications

## Identity Permission
The `identity` permission is required to authenticate users and sync their sticky notes across devices. We use `chrome.identity.launchWebAuthFlow` to securely handle OAuth 2.0 authentication flows (via Supabase), ensuring that user data is synchronized and accessible only to the authenticated user.