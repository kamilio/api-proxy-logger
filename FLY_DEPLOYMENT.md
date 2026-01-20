# Fly.io Deployment Guide

This guide will help you deploy the LLM Debugger to Fly.io.

## Prerequisites

1. Install the Fly CLI:
   ```bash
   # macOS
   brew install flyctl

   # Linux
   curl -L https://fly.io/install.sh | sh

   # Windows
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```

2. Sign up for a Fly.io account and authenticate:
   ```bash
   fly auth signup
   # or if you already have an account
   fly auth login
   ```

## Configuration Files

The deployment uses the following configuration files:

- `fly.toml` - Fly.io application configuration
- `Dockerfile` - Container definition
- `.dockerignore` - Files to exclude from the Docker build
- `config.yaml` - Your API provider configuration

## Deployment Steps

### 1. Create the Fly App

```bash
# Create a new app (let Fly.io generate a name)
fly apps create

# Or specify your own app name
fly apps create your-app-name
```

Update the `app` name in `fly.toml` if you chose a custom name.

### 2. Create Persistent Volumes

The app uses two persistent volumes for data that survives deployments:

```bash
# Create volume for logs (1GB)
fly volumes create llm_logs --region iad --size 1

# Create volume for configuration (100MB)
fly volumes create llm_config --region iad --size 1
```

Note: Replace `iad` with your preferred region (e.g., `lhr` for London, `fra` for Frankfurt). Use `fly platform regions` to see available regions.

### 3. Set Environment Variables

Set the required environment variables:

```bash
# Required variables
fly secrets set PROXY_HOST=your-app-name.fly.dev
fly secrets set PROXY_PORT=8080
fly secrets set TARGET_URL=https://api.openai.com

# Optional: If you have API keys to set
fly secrets set OPENAI_API_KEY=your-key-here
fly secrets set ANTHROPIC_API_KEY=your-key-here
```

### 4. Deploy the Application

```bash
# Deploy the application
fly deploy

# Or if you want to build locally and push
fly deploy --local-only
```

### 5. Verify Deployment

```bash
# Check app status
fly status

# View logs
fly logs

# Open the app in your browser
fly open

# Access the viewer UI
fly open /viewer
```

## Using the Deployed Proxy

Once deployed, your API proxy will be available at:

- Base URL: `https://your-app-name.fly.dev`
- Proxy endpoint: `https://your-app-name.fly.dev/proxy/<provider>/*`
- Mock endpoint: `https://your-app-name.fly.dev/api/<shape>/*`
- Viewer UI: `https://your-app-name.fly.dev/viewer`
- Health check: `https://your-app-name.fly.dev/health`

### Configure Your LLM Client

Set your LLM client's base URL to point to your deployed proxy:

```python
# Python example with OpenAI
from openai import OpenAI

client = OpenAI(
    base_url="https://your-app-name.fly.dev/proxy/openai",
    api_key="your-api-key"
)
```

```javascript
// JavaScript example with OpenAI
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://your-app-name.fly.dev/proxy/openai',
  apiKey: 'your-api-key',
});
```

## Managing the Deployment

### Update Configuration

To update your `config.yaml`:

```bash
# SSH into the container
fly ssh console

# Edit the config file
vi /app/config/config.yaml

# Or copy a new config from your local machine
fly ssh console -C "cat > /app/config/config.yaml" < config.yaml
```

### View Logs

```bash
# Stream logs
fly logs

# View stored logs in the container
fly ssh console -C "ls -la /app/logs/"
```

### Scale the Application

```bash
# Scale to multiple instances
fly scale count 2

# Scale machine size
fly scale vm shared-cpu-2x --memory 512
```

### Monitor Usage

```bash
# View metrics
fly dashboard metrics

# Check status
fly status
```

## Environment Variables

The application supports the following environment variables:

- `PROXY_HOST` (required) - Hostname for the proxy
- `PROXY_PORT` (required) - Port for the proxy server
- `TARGET_URL` (required) - Base target URL for proxying
- `PORT` - Internal port (default: 8080)
- `LLM_DEBUGGER_HOME` - Base directory for config/logs (optional)
- `CONFIG_PATH` - Path to config.yaml (default: /app/config/config.yaml)
- `LOG_OUTPUT_DIR` - Directory for log files (default: /app/logs)
- `RESPONSES_PATH` - Path to responses.yaml (default: /app/logs/responses.yaml)

## Troubleshooting

### Check Application Logs

```bash
fly logs
```

### SSH into the Container

```bash
fly ssh console
```

### Restart the Application

```bash
fly apps restart
```

### Check Volume Status

```bash
fly volumes list
```

### Update Deployment

After making changes to your code:

```bash
fly deploy
```

## Cost Considerations

- Fly.io offers a generous free tier
- Persistent volumes incur a small monthly cost
- Consider using auto-stop/start to save costs during idle periods
- Monitor usage with `fly dashboard`

## Security Notes

1. Always use secrets for API keys (`fly secrets set`)
2. The proxy logs are stored in persistent volumes - ensure you're comfortable with this
3. Consider adding authentication if exposing sensitive endpoints
4. Review and update the `ignore_routes` in config.yaml for sensitive paths

## Cleanup

To remove the deployment:

```bash
# Delete the app and all resources
fly apps destroy your-app-name
```

This will delete the app, volumes, and all associated resources.
