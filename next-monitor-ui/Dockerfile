# Multi-stage Dockerfile for Next.js production
FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --silent

# Copy source and build
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built output and production deps
COPY --from=builder /app/ .

EXPOSE 3000
CMD ["npm", "run", "start"]
