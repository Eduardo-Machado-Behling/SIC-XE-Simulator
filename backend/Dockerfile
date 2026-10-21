# ==========================================
# Build stage
# ==========================================

FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        cmake \
        git \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

# Configure a production build without the test targets.
RUN cmake -S . -B build \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_TESTING=OFF

# Compile
RUN cmake --build build -j$(nproc) 


# ==========================================
# Runtime stage
# ==========================================

FROM ubuntu:24.04 AS runtime

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libstdc++6 && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/bin/api /app/bin/api
COPY --from=builder /app/bin/archs /app/bin/archs

# Vercel provides PORT automatically.
ENV PORT=8080

CMD ["/app/bin/api"]
