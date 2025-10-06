# MiniDev Preview Host

A unified preview hosting system that supports both local development and cloud deployment with external platform integration (Vercel/Netlify).

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Main App      │───▶│  Orchestrator    │───▶│  External       │
│  (minidev)      │    │  (Railway/Local) │    │  Platforms      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │  Local Previews  │
                       │  (Development)   │
                       └──────────────────┘
```

## 🚀 Quick Start

### Local Development
```bash
cd orchestrator
npm install
node index.js
```

### Railway Deployment
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up
```

## ⚙️ Configuration

### Environment Variables

#### Core Configuration
```bash
# Basic
PORT=8080
PREVIEW_AUTH_TOKEN=your-secure-auth-token

# Paths
BOILERPLATE_DIR=/srv/boilerplate
PREVIEWS_ROOT=/srv/previews  # Local: /srv/previews, Railway: /tmp/previews
PNPM_STORE_DIR=/srv/previews/.pnpm-store  # Local: /srv/previews/.pnpm-store, Railway: /tmp/.pnpm-store
BASE_PORT=4000  # Only for local development
```

#### External Deployment (Feature Flags)
```bash
# Vercel Integration
ENABLE_VERCEL_DEPLOYMENT=true
DEPLOYMENT_TOKEN_SECRET=your-vercel-deployment-token
VERCEL_TEAM_ID=your-team-id  # Optional: for team accounts

# Netlify Integration
ENABLE_NETLIFY_DEPLOYMENT=true
NETLIFY_TOKEN=your-netlify-token

# Smart Contract Deployment
ENABLE_CONTRACT_DEPLOYMENT=true
PRIVATE_KEY=your-private-key
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

#### Railway-Specific
```bash
# Railway Environment Detection
RAILWAY_ENVIRONMENT=true  # Set automatically by Railway
FORCE_EXTERNAL_DEPLOYMENT=true  # Force external deployment on Railway
```

## 🌍 Deployment Modes

### 1. Local Development Mode (Default)
- **Environment**: Local development
- **Previews**: Local port management (4000+)
- **Storage**: Persistent (`/srv/previews`)
- **Features**: All features available
- **Use Case**: Development and testing

### 2. Railway Production Mode
- **Environment**: Railway cloud platform
- **Previews**: External deployments only (Vercel/Netlify)
- **Storage**: Ephemeral (`/tmp/previews`)
- **Features**: External deployments, health monitoring
- **Use Case**: Production hosting

## 📡 API Endpoints

### Deploy Preview
```http
POST /deploy
Authorization: Bearer YOUR_AUTH_TOKEN
Content-Type: application/json

{
  "hash": "project-id",
  "files": {
    "src/app/page.tsx": "export default function Home() { return <h1>Hello!</h1>; }"
  },
  "deployToExternal": "vercel"  // Optional: "vercel" | "netlify"
}
```

**Response (Local):**
```json
{
  "previewUrl": "localhost:8080/p/project-id",
  "vercelUrl": "localhost:8080/p/project-id",
  "status": "running",
  "port": 4001
}
```

**Response (External):**
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

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "platform": "railway",
  "environment": "production",
  "externalDeployments": 5,
  "features": {
    "vercelDeployment": true,
    "netlifyDeployment": false,
    "contractDeployment": true,
    "forceExternalDeployment": true
  }
}
```

### Other Endpoints
- `POST /previews` - Create/update preview
- `DELETE /previews/:id` - Stop preview
- `GET /previews/:id/status` - Get preview status
- `GET /previews/:id/logs` - Get preview logs
- `POST /previews/:id/execute` - Execute safe commands
- `GET /p/:id` - Access preview (public)

## 🔧 Platform Integration

### Vercel Integration

#### Setup
1. **Get Vercel Token**: [vercel.com/account/tokens](https://vercel.com/account/tokens)
2. **Create Token**: 
   - Name: `Company Railway Preview Deployments`
   - Scope: `Deployment`
   - Team: Select your company team (if applicable)
3. **Configure Environment**:
   ```bash
   ENABLE_VERCEL_DEPLOYMENT=true
   DEPLOYMENT_TOKEN_SECRET=your-vercel-token
   VERCEL_TEAM_ID=your-team-id  # Optional
   ```

#### Features
- Automatic project creation
- Next.js framework detection
- Production deployments
- Custom domains support
- Team account integration

### Netlify Integration

#### Setup
1. **Get Netlify Token**: [app.netlify.com/user/applications](https://app.netlify.com/user/applications)
2. **Create Token**: Personal access token
3. **Configure Environment**:
   ```bash
   ENABLE_NETLIFY_DEPLOYMENT=true
   NETLIFY_TOKEN=your-netlify-token
   ```

#### Features
- Local build then deploy
- Static site hosting
- Custom domains
- Form handling

### Smart Contract Deployment

#### Setup
1. **Get Private Key**: From your wallet
2. **Configure Environment**:
   ```bash
   ENABLE_CONTRACT_DEPLOYMENT=true
   PRIVATE_KEY=your-private-key
   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
   ```

#### Features
- Hardhat integration
- Base Sepolia testnet
- Automatic compilation
- Deployment info tracking

## 🚀 Deployment Guides

### Railway Deployment

#### Step 1: Prepare Repository
```bash
# Ensure you have these files:
# - orchestrator/index.js (unified orchestrator)
# - Dockerfile.railway
# - orchestrator/package.json
```

#### Step 2: Deploy to Railway
```bash
# Option A: Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up

# Option B: Railway Dashboard
# 1. Go to railway.app
# 2. New Project → Deploy from GitHub repo
# 3. Select your repository
```

#### Step 3: Configure Environment Variables
```bash
# Required
PREVIEW_AUTH_TOKEN=your-secure-token
FORCE_EXTERNAL_DEPLOYMENT=true
ENABLE_VERCEL_DEPLOYMENT=true
DEPLOYMENT_TOKEN_SECRET=your-vercel-token

# Optional
VERCEL_TEAM_ID=your-team-id
ENABLE_NETLIFY_DEPLOYMENT=false
ENABLE_CONTRACT_DEPLOYMENT=false
```

#### Step 4: Test Deployment
```bash
# Health check
curl https://your-railway-app.railway.app/health

# Deploy preview
curl -X POST https://your-railway-app.railway.app/deploy \
  -H "Authorization: Bearer your-auth-token" \
  -H "Content-Type: application/json" \
  -d '{
    "hash": "test-project",
    "files": {
      "src/app/page.tsx": "export default function Home() { return <h1>Hello Railway!</h1>; }"
    },
    "deployToExternal": "vercel"
  }'
```

### Local Development

#### Setup
```bash
cd orchestrator
npm install

# Optional: Configure environment
cp env.example .env
# Edit .env with your settings
```

#### Run
```bash
# Basic (local previews only)
node index.js

# With Vercel integration
ENABLE_VERCEL_DEPLOYMENT=true \
DEPLOYMENT_TOKEN_SECRET=your-token \
node index.js

# With all features
ENABLE_VERCEL_DEPLOYMENT=true \
ENABLE_NETLIFY_DEPLOYMENT=true \
ENABLE_CONTRACT_DEPLOYMENT=true \
DEPLOYMENT_TOKEN_SECRET=your-vercel-token \
NETLIFY_TOKEN=your-netlify-token \
PRIVATE_KEY=your-private-key \
node index.js
```

## 🔒 Security

### Authentication
- All management endpoints require `PREVIEW_AUTH_TOKEN`
- Preview endpoints are public (for external deployments)
- Command execution is restricted to safe commands only

### Command Execution Security
- Whitelisted commands only: `grep`, `find`, `tree`, `cat`, `head`, `tail`, `wc`, `ls`, `pwd`, `file`, `which`, `type`, `dirname`, `basename`, `realpath`
- Argument validation and sanitization
- Working directory restrictions
- Dangerous pattern detection

### Environment Security
- Tokens stored in environment variables only
- No sensitive data in logs
- Feature flags prevent accidental deployments

## 🐛 Troubleshooting

### Common Issues

#### "External deployment is disabled"
- Check feature flags: `ENABLE_VERCEL_DEPLOYMENT=true` or `ENABLE_NETLIFY_DEPLOYMENT=true`
- Verify platform tokens are set correctly
- Check logs for CLI installation issues

#### "No Vercel URL found in output"
- Vercel CLI output parsing failed
- Check Railway logs for Vercel CLI output
- Verify token has correct permissions

#### "Vercel CLI not found"
- Dockerfile installs Vercel CLI globally
- Check Railway build logs
- Use `npx vercel` as fallback

#### Authentication Errors
- Verify `PREVIEW_AUTH_TOKEN` is set correctly
- Check token hasn't expired
- Ensure Bearer token format: `Bearer your-token`

#### Local Previews Not Working
- Ensure `PREVIEW_AUTH_TOKEN` is set
- Verify `BOILERPLATE_DIR` contains valid Next.js boilerplate
- Check `PREVIEWS_ROOT` directory exists and is writable
- Check for port conflicts with `BASE_PORT`

### Debug Commands

#### Railway
```bash
# Test Vercel CLI
railway run vercel --version

# Check environment variables
railway run env | grep VERCEL

# View logs
railway logs
```

#### Local
```bash
# Check environment detection
curl http://localhost:8080/health | jq '.platform'

# Test deployment
curl -X POST http://localhost:8080/deploy \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"hash": "test", "files": {"test.js": "console.log(\"hello\")"}}'
```

## 📊 Monitoring

### Health Monitoring
- Health check endpoint: `GET /health`
- Returns deployment status and metrics
- Railway can use this for health monitoring

### Logs
- **Railway**: Built-in log viewing in dashboard
- **Local**: Console output with structured logging
- **External deployments**: Captured and stored in preview logs

### Metrics
- Active previews count
- External deployment status
- Feature availability
- Environment information

## 💰 Cost Considerations

### Railway
- Free tier available
- Pay for usage (CPU, memory, bandwidth)
- Ephemeral storage (no persistent costs)

### Vercel
- Free tier: 100 deployments/day (hobby)
- Pro: 1000 deployments/day
- Enterprise: Custom limits

### Netlify
- Free tier available
- Pay for bandwidth and build minutes
- Team plans for collaboration

### Combined Strategy
- Very cost-effective for development previews
- Railway handles orchestration
- External platforms handle actual hosting
- No persistent storage costs

## 🔄 Migration Notes

### From Separate Files
If you were using separate `index-railway.js`:

1. ✅ **No changes needed** - unified `index.js` handles both environments
2. ✅ **Same API endpoints** - all endpoints work the same way
3. ✅ **Environment variables** - use the same variables as before
4. ✅ **Dockerfile** - updated to use unified `index.js`

### From Complex Hosting Manager
This implementation replaces complex hosting systems with:
- ✅ Simpler configuration via environment variables
- ✅ Feature flags for gradual rollout
- ✅ Backwards compatibility with existing deployment flows
- ✅ Reduced complexity and dependencies

## 📚 Additional Resources

- [Railway Documentation](https://docs.railway.app/)
- [Vercel Documentation](https://vercel.com/docs)
- [Netlify Documentation](https://docs.netlify.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Hardhat Documentation](https://hardhat.org/docs)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally and on Railway
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
