FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN node web/build.mjs
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "--no-warnings=ExperimentalWarning", "src/server.js"]
