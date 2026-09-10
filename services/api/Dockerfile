FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgomp1 && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml requirements.lock ./
RUN pip install -r requirements.lock
COPY . .
RUN useradd --create-home --uid 10001 oral && mkdir -p /data && chown oral:oral /data
USER oral
ENV DATA_DIR=/data HF_HOME=/data/models
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
