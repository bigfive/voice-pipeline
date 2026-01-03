# LocalAI with pre-installed models for voice assistant
FROM localai/localai:latest-aio

# Copy model configs
COPY models/*.yaml /build/models/

# Pre-download models during build
RUN local-ai run --models-path /build/models --preload-models

