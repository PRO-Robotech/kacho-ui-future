FROM node:22-alpine AS build

WORKDIR /app

ARG KACHO_DASHBOARD_REMOTE=/dashboard/assets/remoteEntry.js
ENV KACHO_DASHBOARD_REMOTE=$KACHO_DASHBOARD_REMOTE

COPY host/package*.json ./
RUN npm ci

COPY host/ ./
RUN npm run build

FROM nginx:1.27-alpine

COPY host/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
