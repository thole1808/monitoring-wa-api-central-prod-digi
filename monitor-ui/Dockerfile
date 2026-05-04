FROM node:18-bullseye-slim
WORKDIR /app

# Install sshpass (required by server script) and dependencies
COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends sshpass ca-certificates curl && \
    npm install --production --silent && \
    rm -rf /var/lib/apt/lists/*

# Copy app
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node","server.js"]
