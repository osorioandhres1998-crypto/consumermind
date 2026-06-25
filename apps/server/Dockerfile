# Backend Express de ConsumerMind — pensado para Railway (root dir = apps/server).
FROM node:20-alpine

WORKDIR /app

# Instala solo dependencias de producción a partir del package.json del backend.
COPY package.json ./
RUN npm install --omit=dev

# Copia el código del backend.
COPY . .

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "index.js"]
