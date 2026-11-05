FROM node:22-alpine AS build
WORKDIR /app
# optional extra CA for TLS-intercepting networks (build stage only, never in the final image)
COPY certs/ /certs/
RUN cat /certs/*.crt > /tmp/extra-ca.pem 2>/dev/null || true
ENV NODE_EXTRA_CA_CERTS=/tmp/extra-ca.pem
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY scripts ./scripts
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine
ENV PORT=3000 BACKEND_URL=http://server:8000 NGINX_ENVSUBST_FILTER="^(PORT|BACKEND_URL)$"
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
