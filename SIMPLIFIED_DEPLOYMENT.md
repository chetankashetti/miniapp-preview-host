# Simplified Deployment Implementation

## Overview

This simplified deployment implementation adds Vercel/Netlify support to the existing preview host with feature flags. When disabled (default), it falls back to local previews only.

## Features

- ✅ Local previews (default behavior, always enabled)
- ✅ Optional Vercel deployment (disabled by default)
- ✅ Optional Netlify deployment (disabled by default)
- ✅ Feature flags for easy enable/disable
- ✅ Simple environment configuration
- ✅ Backwards compatible with existing `/deploy` endpoint

## Configuration

### Environment Variables

Copy `environment.example` and configure:

```bash
# Basic Configuration
PORT=8080
PREVIEW_AUTH_TOKEN=your-secret-token-here

# Directory Configuration  
BOILERPLATE_DIR=/srv/boilerplate
PREVIEWS_ROOT=/srv/previews
PNPM_STORE_DIR=/srv/previews/.pnpm-store
BASE_PORT=4000

# Feature Flags (disabled by default)
ENABLE_VERCEL_DEPLOYMENT=false
ENABLE_NETLIFY_DEPLOYMENT=false

# Platform Tokens (only needed if deployments enabled)
VERCEL_TOKEN=your-vercel-token-here
NETLIFY_TOKEN=your-netlify-token-here
```

### Usage Modes

#### 1. Local Previews Only (Default)
```bash
# Run with default settings - only local previews
npm start
```

#### 2. Enable Vercel Deployment
```bash
export ENABLE_VERCEL_DEPLOYMENT=true
export VERCEL_TOKEN=your-vercel-token
npm start
```

#### 3. Enable Netlify Deployment  
```bash
export ENABLE_NETLIFY_DEPLOYMENT=true
export NETLIFY_TOKEN=your-netlify-token
npm start
```

#### 4. Enable Both Platforms
```bash
export ENABLE_VERCEL_DEPLOYMENT=true
export ENABLE_NETLIFY_DEPLOYMENT=true
export VERCEL_TOKEN=your-vercel-token
export NETLIFY_TOKEN=your-netlify-token
npm start
```

## API Endpoints

### Local Preview (Default behavior)
```http
POST /deploy
Content-Type: application/json
Authorization: Bearer YOUR_AUTH_TOKEN

{
  "hash": "project-id",
  "files": {
    "src/app.js": "console.log('hello')",
    "package.json": "{\"name\": \"test\"}"
  }
}
```

Response:
```json
{
  "previewUrl": "localhost:8080/p/project-id",
  "vercelUrl": "localhost:8080/p/project-id",
  "status": "running"
}
```

### External Deployment (Optional)
```http
POST /deploy  # Same endpoint!
Content-Type: application/json
Authorization: Bearer YOUR_AUTH_TOKEN

{
  "hash": "project-id",
  "deployToExternal": "vercel",  // or "netlify"
  "files": {
    "src/app.js": "console.log('hello')",
    "package.json": "{\"name\": \"test\"}"
  }
}
```

Response:
```json
{
  "success": true,
  "previewUrl": "https://project-id.vercel.app",
  "vercelUrl": "https://project-id.vercel.app",
  "externalDeployment": true,
  "platform": "vercel",
  "status": "completed"
}
```

## Platform Configuration

### Vercel
- Requires `VERCEL Token` from vercel.com dashboard
- Automatically installs Vercel CLI if needed
- Builds and deploys using Vercel's native Next.js support

### Netlify  
- Requires `Netlify Token` from netlify.com dashboard
- Automatically installs Netlify CLI if needed
- Runs `npm run build` locally then deploys `.next` directory

## Security Considerations

- Deployment tokens are read from environment variables only
- Feature flags prevent accidental external deployments
- Local previews work independently of deployment configuration
- No sensitive tokens stored in logs or configurations

## Troubleshooting

### Deployment Disabled
If you get "deployment is disabled" errors:
1. Check feature flags: `ENABLE_VERCEL_DEPLOYMENT=true` or `ENABLE_NETLIFY_DEPLOYMENT=true`
2. Verify platform tokens are set correctly
3. Check logs for CLI installation issues

### Local Previews Not Working
- Ensure `PREVIEW_AUTH_TOKEN` is set
- Verify `BOILERPLATE_DIR` contains valid Next.js boilerplate
- Check `PREVIEWS_ROOT` directory exists and is writable

## Migration Notes

This implementation replaces the complex hosting manager system with:
- ✅ Simpler configuration via environment variables
- ✅ Feature flags for gradual rollout
- ✅ Backwards compatibility with existing deployment flows
- ✅ Reduced complexity and dependencies
