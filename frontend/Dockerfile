# Stage 1: Build React app
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (cache layer)
COPY frontend/package.json frontend/yarn.lock ./
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
RUN yarn install --frozen-lockfile --silent

# Copy source and build
COPY frontend/ ./
ARG REACT_APP_BACKEND_URL=/api
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ENV GENERATE_SOURCEMAP=false
RUN yarn build

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine

# Copy built React app
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx config
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/nginx-health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
