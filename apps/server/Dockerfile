# Backend Express de ConsumerMind — para Railway (root dir = . en Railway).
FROM node:20-alpine

WORKDIR /app

# Copia los package.json de la raíz (monorepo) y del server
COPY package*.json ./
COPY apps/server/package*.json ./apps/server/

# Instala dependencias de producción del monorepo (solo server)
RUN npm install --omit=dev --workspace=@consumermind/server

# Copia el código completo (necesario para que funcione el monorepo)
COPY apps/server ./apps/server

ENV NODE_ENV=production
EXPOSE 3001

WORKDIR /app/apps/server
CMD ["node", "index.js"]
