// Public configuration only. Never put Meta secrets or Instagram tokens here.
// Set to the deployed Worker HTTPS origin after server configuration is complete.
globalThis.IG_CONFIG = Object.assign({ instagramApiUrl: '', apifyApiUrl: '' }, globalThis.IG_CONFIG || {});
