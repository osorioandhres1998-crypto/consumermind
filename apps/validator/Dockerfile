FROM python:3.11-slim

# Evita archivos .pyc y fuerza salida sin buffer (logs en tiempo real).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Instalar dependencias primero para aprovechar la caché de capas.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código de la aplicación.
COPY app ./app

EXPOSE 8000

# Arranque del servidor ASGI. Forma shell para expandir ${PORT}: en local (y en
# docker-compose) PORT no está definido y se usa 8000; en hosts como Railway o
# Render se respeta el puerto que inyecta la plataforma.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
