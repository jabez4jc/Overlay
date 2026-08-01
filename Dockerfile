FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3333

# Copy package metadata + postinstall script before npm ci,
# because npm runs postinstall during dependency install.
COPY package*.json ./
COPY scripts ./scripts
RUN npm ci --omit=dev

COPY . .

EXPOSE 3333

CMD ["npm", "start"]
