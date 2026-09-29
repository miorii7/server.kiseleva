FROM node:22-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY --chown=node:node . .

RUN chown node:node /app
USER node

EXPOSE 3001

CMD ["node", "index.js"]
