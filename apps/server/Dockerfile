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

# Migra el esquema (idempotente: todo con IF NOT EXISTS) antes de arrancar,
# para que un commit con tablas/columnas nuevas nunca quede desincronizado
# de la base de datos en producción. Si la migración falla, el deploy falla
# de forma visible en vez de arrancar con un esquema desactualizado.
CMD ["sh", "-c", "node db/migrate.js && node index.js"]
