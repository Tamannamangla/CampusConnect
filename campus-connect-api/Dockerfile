FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node . .
ENV NODE_ENV=production
EXPOSE 3001
USER node
CMD ["node", "server.js"]
