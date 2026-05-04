# Multi-stage Dockerfile for Next.js production
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY .env.local .env.local
RUN npm ci --silent

# Copy source and build
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built output and production deps
COPY --from=builder /app/ .

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:3000/ || exit 1
CMD ["npm", "run", "start"]
