# AniPlayV2 v1.3.0 Release Notes

## Features
- **Local Network Streaming**: You can now expose your AniPlay catalog over your local Wi-Fi automatically from the Settings page. This spins up a background Express server that seamlessly acts as a hub for your network.
- **Smart Network Fallbacks**: Added responsive HTTP fallbacks for the React UI preventing crashes when viewing locally on iPhones, laptops, and smart TVs via browser.
- **Live Connected Client Monitoring**: View real-time timestamps and IP Addresses of all active viewing clients securely streaming off your host PC.
- **Dynamic Header Spoofing Proxy**: Seamlessly overrides strict hotlink security protocols. All media chunks are piped back through the host desktop retaining active ciphermap metadata (Referer & UserAgent). No proxy or Basic Auth errors!

## Fixes
- Added aggressive priority sorting for APIPA link-local (`169.x.x.x`) and isolated virtualization interfaces ensuring the correct IP is invariably assigned when running VPNs (NordVPN, Tailscale).
- Externalized backend modules resulting in fixed rollup TTY bundling crashes for cleaner Electron compilations.
