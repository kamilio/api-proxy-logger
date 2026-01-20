# Use Node.js 20 LTS Alpine for smaller image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY src/ ./src/
COPY config.yaml ./config/config.yaml

# Create directories for logs and ensure proper permissions
RUN mkdir -p /app/logs /app/config && \
    chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose the port
EXPOSE 8080

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "src/cli.js"]